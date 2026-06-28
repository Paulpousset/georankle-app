/**
 * Reusable mock of the Supabase client for unit tests.
 *
 * The real client is a fluent builder: `supabase.from('t').select('*').eq(...)`
 * and friends each return the builder, and the chain is awaited at the end
 * (`await ...`, `.single()` or `.maybeSingle()`) to get `{ data, error }`. This
 * helper reproduces that shape:
 *
 *  - every chainable method (`select`, `eq`, `order`, `insert`, `update`,
 *    `delete`, ...) is a `jest.fn` that returns the same builder, so calls can
 *    be asserted with `toHaveBeenCalledWith` and chains of any length resolve;
 *  - the builder is itself awaitable (it implements `then`), and `single` /
 *    `maybeSingle` resolve too, so terminal-or-not chains both work;
 *  - results are configured per table via `__setResult(table, { data, error })`
 *    (or globally via `__setDefault`), read lazily at await time.
 *
 * `rpc`, `functions.invoke` and `auth.getSession` are plain `jest.fn`s the test
 * drives with `mockResolvedValue`.
 *
 * Usage (inside a test file):
 *
 *   jest.mock('../supabase', () => {
 *     const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
 *     return { supabase: makeSupabaseMock() };
 *   });
 *   import { supabase } from '../supabase';
 *   const sb = supabase as unknown as SupabaseMock;
 *   beforeEach(() => sb.__reset());
 */

export type QueryResult<T = unknown> = { data: T; error: { message: string } | null };

const EMPTY: QueryResult = { data: null, error: null };

/** Methods that return the builder so the chain continues. */
const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'or',
  'and',
  'not',
  'filter',
  'match',
  'order',
  'limit',
  'range',
  'overlaps',
] as const;

export interface QueryBuilderMock {
  // `then` (declared below) is a function whose own parameters are functions, so
  // the index value type must accept any-arg functions for it to conform under
  // strictFunctionTypes — `unknown[]` params would reject it.
  [method: string]: jest.Mock | ((...args: any[]) => unknown);
  maybeSingle: jest.Mock;
  single: jest.Mock;
  then: (resolve: (v: QueryResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
}

export interface SupabaseMock {
  from: jest.Mock;
  rpc: jest.Mock;
  functions: { invoke: jest.Mock };
  auth: { getSession: jest.Mock; getUser: jest.Mock };
  /** Configure the `{ data, error }` resolved for a given table's next chains. */
  __setResult: (table: string, result: QueryResult) => SupabaseMock;
  /** Configure the result used for tables without an explicit `__setResult`. */
  __setDefault: (result: QueryResult) => SupabaseMock;
  /** Reset all configured results and clear every jest.fn call record. */
  __reset: () => void;
}

function makeBuilder(getResult: () => QueryResult): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;
  for (const method of CHAIN_METHODS) {
    builder[method] = jest.fn(() => builder);
  }
  // Terminal accessors used by the app — both resolve to the configured result.
  builder.maybeSingle = jest.fn(() => Promise.resolve(getResult()));
  builder.single = jest.fn(() => Promise.resolve(getResult()));
  // Make the builder awaitable for chains that end without single()/maybeSingle().
  builder.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject);
  return builder;
}

export function makeSupabaseMock(): SupabaseMock {
  const results = new Map<string, QueryResult>();
  let fallback: QueryResult = EMPTY;

  const sb = {
    from: jest.fn((table: string) =>
      makeBuilder(() => (results.has(table) ? (results.get(table) as QueryResult) : fallback)),
    ),
    rpc: jest.fn(() => Promise.resolve(EMPTY)),
    functions: { invoke: jest.fn(() => Promise.resolve(EMPTY)) },
    auth: {
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
    __setResult(table: string, result: QueryResult) {
      results.set(table, result);
      return sb;
    },
    __setDefault(result: QueryResult) {
      fallback = result;
      return sb;
    },
    __reset() {
      results.clear();
      fallback = EMPTY;
      sb.from.mockClear();
      sb.rpc.mockClear();
      sb.rpc.mockImplementation(() => Promise.resolve(EMPTY));
      sb.functions.invoke.mockClear();
      sb.functions.invoke.mockImplementation(() => Promise.resolve(EMPTY));
      sb.auth.getSession.mockClear();
      sb.auth.getUser.mockClear();
    },
  } as SupabaseMock;

  return sb;
}
