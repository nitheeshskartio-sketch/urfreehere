import { createHmac, randomBytes } from 'node:crypto';
import { config } from './config.js';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceConfig {
  iceServers: IceServer[];
  iceTransportPolicy: 'all' | 'relay';
  turnEnabled: boolean;
}

/**
 * Builds the ICE configuration handed to a peer when it creates or joins a room.
 *
 * With TURN_SECRET set, credentials follow the TURN REST API convention used by
 * coturn (`use-auth-secret`): username = "<expiry>:<random>", credential =
 * base64(HMAC-SHA1(secret, username)). They expire, so leaked credentials are
 * of limited use.
 */
export function buildIceConfig(): IceConfig {
  const { ice } = config;
  const iceServers: IceServer[] = [];

  if (ice.stunUrls.length) iceServers.push({ urls: ice.stunUrls });

  let turnEnabled = false;
  if (ice.turnUrls.length) {
    if (ice.turnSecret) {
      const expiry = Math.floor(Date.now() / 1000) + ice.turnCredentialTtl;
      const username = `${expiry}:${randomBytes(6).toString('hex')}`;
      const credential = createHmac('sha1', ice.turnSecret).update(username).digest('base64');
      iceServers.push({ urls: ice.turnUrls, username, credential });
      turnEnabled = true;
    } else if (ice.turnUsername && ice.turnCredential) {
      iceServers.push({ urls: ice.turnUrls, username: ice.turnUsername, credential: ice.turnCredential });
      turnEnabled = true;
    } else {
      console.warn('[ice] TURN_URLS is set but no TURN_SECRET or TURN_USERNAME/TURN_CREDENTIAL; TURN disabled.');
    }
  }

  return {
    iceServers,
    iceTransportPolicy: turnEnabled ? ice.transportPolicy : 'all',
    turnEnabled,
  };
}
