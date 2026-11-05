import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { AppError } from '../../http/errors.ts';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');

export function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 && /^[23]/i.test(address) && !blocked.check(address, 'ipv6');
}
async function publicDestination(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_ENDPOINT', 'Enter a valid HTTPS API URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new AppError(
      400,
      'INVALID_ENDPOINT',
      'Use a public HTTPS API URL without credentials or query parameters.',
    );
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new AppError(400, 'PRIVATE_ENDPOINT', 'Private-network model endpoints are not enabled.');
  return { url, address: addresses[0]! };
}
export async function validateEndpoint(value: string) {
  return (await publicDestination(value)).url.toString();
}

/** Resolve, validate, and pin the connection to that address. TLS still verifies the original hostname. */
export function endpointFetch(baseUrl: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    if (url.origin !== new URL(baseUrl).origin)
      throw new AppError(
        400,
        'ENDPOINT_CHANGED',
        'The model request changed its configured API origin.',
      );
    const { address } = await publicDestination(url.origin + url.pathname);
    const body = request.body ? Buffer.from(await request.arrayBuffer()) : undefined;
    if (body && body.length > 512 * 1024)
      throw new AppError(
        413,
        'MODEL_REQUEST_TOO_LARGE',
        'The model request is too large. Start a new conversation.',
      );
    return new Promise<Response>((resolve, reject) => {
      const outgoing = httpsRequest(
        url,
        {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          agent: false,
          signal: request.signal,
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options.all)
              callback(null, [{ address: address.address, family: address.family }]);
            else callback(null, address.address, address.family);
          },
        },
        (response) => {
          if ((response.statusCode ?? 500) >= 300 && (response.statusCode ?? 500) < 400) {
            response.destroy();
            reject(
              new AppError(400, 'MODEL_REDIRECT_REJECTED', 'Model API redirects are not allowed.'),
            );
            return;
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers))
            if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
          // Ask the endpoint for an uncompressed body; this transport does not decode content encodings.
          if (headers.has('content-encoding') && headers.get('content-encoding') !== 'identity') {
            response.destroy();
            reject(
              new AppError(
                422,
                'MODEL_ENCODING_UNSUPPORTED',
                'The model endpoint returned an unsupported content encoding.',
              ),
            );
            return;
          }
          resolve(
            new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
              status: response.statusCode ?? 500,
              headers,
            }),
          );
        },
      );
      outgoing.setHeader('Accept-Encoding', 'identity');
      outgoing.setTimeout(90000, () => outgoing.destroy(new Error('Model request timed out.')));
      outgoing.once('error', reject);
      outgoing.end(body);
    });
  };
}
