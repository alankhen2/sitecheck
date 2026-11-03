import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import type { PublicUser, Role } from '@sitecheck/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { AuthService } from '../services/auth.service.js';

export const SESSION_COOKIE = 'sitecheck_session';
const SESSION_SECONDS = 8 * 60 * 60; // one work shift

// The token only carries the user id. Role and name are read from the database
// on every request, so a changed role or a deleted user takes effect immediately.
const tokenPayloadSchema = z.object({ sub: z.uuid() });
type TokenPayload = z.infer<typeof tokenPayloadSchema>;

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenPayload;
    user: PublicUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: 401 unless the request has a valid session for an existing user. */
    authenticate: PreHandler;
    /** preHandler: authenticates, then 403 unless the user has one of `roles`. */
    requireRole: (...roles: Role[]) => PreHandler;
  }
  interface FastifyReply {
    startSession(userId: string): Promise<void>;
    endSession(): void;
  }
}

export interface AuthPluginOptions {
  config: Config;
  auth: AuthService;
}

/**
 * Sessions are a signed JWT in an httpOnly cookie:
 * - httpOnly: page JavaScript (and so an XSS payload) cannot read the token.
 * - sameSite strict: the browser does not send it on requests from other sites (CSRF).
 * - secure in production: only sent over HTTPS.
 */
export const authPlugin = fp<AuthPluginOptions>(
  async (app, { config, auth }) => {
    await app.register(fastifyCookie);
    await app.register(fastifyJwt, {
      secret: config.JWT_SECRET,
      sign: { algorithm: 'HS256', expiresIn: SESSION_SECONDS },
      // Pin the algorithm so a token cannot pick its own (e.g. "none").
      verify: { algorithms: ['HS256'] },
    });

    const cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.NODE_ENV === 'production',
    } as const;

    app.decorateReply('startSession', async function (this: FastifyReply, userId: string) {
      const token = await this.jwtSign({ sub: userId });
      this.setCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    });

    app.decorateReply('endSession', function (this: FastifyReply) {
      this.clearCookie(SESSION_COOKIE, cookieOptions);
    });

    const unauthorized = (reply: FastifyReply) =>
      reply.code(401).send({ message: 'Authentication required' });

    const authenticate: PreHandler = async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (!token) return unauthorized(reply);

      let payload: TokenPayload;
      try {
        // verify() checks the signature, the algorithm and the expiry; the schema checks the shape.
        payload = tokenPayloadSchema.parse(app.jwt.verify<object>(token));
      } catch {
        return unauthorized(reply);
      }

      const user = await auth.getUser(payload.sub);
      if (!user) return unauthorized(reply);
      request.user = user;
    };

    app.decorate('authenticate', authenticate);

    app.decorate('requireRole', (...roles: Role[]): PreHandler => {
      return async (request, reply) => {
        await authenticate(request, reply);
        if (reply.sent) return;
        if (!roles.includes(request.user.role)) {
          return reply.code(403).send({ message: 'You do not have permission to do this' });
        }
      };
    });
  },
  // fastify-plugin removes encapsulation, so the decorators are visible to every route.
  { name: 'auth' },
);
