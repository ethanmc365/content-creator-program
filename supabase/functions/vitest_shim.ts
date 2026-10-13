// Lets the edge-function tests (written for vitest, which `npm test` runs) also run under Deno in CI:
// `deno test --import-map=supabase/functions/deno_test_imports.json supabase/functions`. Deno's standard library
// provides the same describe/it/expect shape.
export { describe, it } from 'jsr:@std/testing@1/bdd'
export { expect } from 'jsr:@std/expect@1'
