import type { LoginBody, PublicUser, RegisterBody, Role } from '@sitecheck/shared';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}

export type NewUser = Omit<UserRecord, 'id'>;

/**
 * The data access the auth rules need. The service depends on this interface,
 * not on Prisma, so unit tests can pass an in-memory version.
 */
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** Must throw EmailTakenError when the email already exists. */
  create(data: NewUser): Promise<UserRecord>;
}

export class EmailTakenError extends Error {
  constructor() {
    super('Email is already registered');
    this.name = 'EmailTakenError';
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export interface AuthServiceDeps {
  users: UserRepository;
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, stored: string) => Promise<boolean>;
}

/** Copies only the public fields, so a password hash can never leak by accident. */
function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function createAuthService({ users, hashPassword, verifyPassword }: AuthServiceDeps) {
  // A real hash of a random-looking string, checked when the email is unknown so that
  // login takes about as long whether or not the account exists. Created on first use.
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = () => (dummyHash ??= hashPassword('not-a-real-password-for-timing'));

  return {
    async register(input: RegisterBody): Promise<PublicUser> {
      // Self-registration always creates an INSPECTOR. Admins are created by
      // the seed (or later by another admin), never by a request body.
      const role: Role = 'INSPECTOR';

      // Checking first gives a clear error in the normal case; the unique index
      // (mapped to EmailTakenError by the repository) still covers two requests racing.
      if (await users.findByEmail(input.email)) throw new EmailTakenError();

      const user = await users.create({
        name: input.name,
        email: input.email,
        role,
        passwordHash: await hashPassword(input.password),
      });
      return toPublicUser(user);
    },

    async login(input: LoginBody): Promise<PublicUser> {
      const user = await users.findByEmail(input.email);
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash ?? (await getDummyHash()),
      );
      if (!user || !valid) throw new InvalidCredentialsError();
      return toPublicUser(user);
    },

    async getUser(id: string): Promise<PublicUser | null> {
      const user = await users.findById(id);
      return user ? toPublicUser(user) : null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
