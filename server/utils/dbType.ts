// Must stay import-free, entity decorators read this during datasource evaluation
// ponytail: hardcoded false so entity files (DbAwareColumn/resolveDbType callers) stay
// unchanged; the dead export itself gets swept once those files are revisited.
export const isPgsql = false as const;
