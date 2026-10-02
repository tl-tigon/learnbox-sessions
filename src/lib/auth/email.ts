/** A full email address: a name, an @ and a domain with a dot. The browser and the server use the same rule. */
export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
