/** `true` when A and B are the same type (used for compile-time checks). */
export type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** Fails typecheck unless T is `true`: `type Check = Assert<Same<X, Y>>`. */
export type Assert<T extends true> = T;
