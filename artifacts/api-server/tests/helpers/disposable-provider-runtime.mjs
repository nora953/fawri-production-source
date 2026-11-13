import {createDisposableKnowledgeRuntime} from './disposable-knowledge-runtime.mjs';

// Same actual tenant/auth split as knowledge; add only the two existing
// verified-provider capabilities required by these owned transport fixtures.
export async function createDisposableProviderRuntime() {
  const bootstrapUrl=process.env.DATABASE_URL;
  const fixture=await createDisposableKnowledgeRuntime();
  try {
    await fixture.admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_admit_verified_payment_receipt(text,text,text,text,integer,text,timestamptz) TO ${fixture.role}`);
    await fixture.admin.query(`GRANT EXECUTE ON FUNCTION public.fawri_resolve_confirmed_payment_order(text,text,text,text,integer,text) TO ${fixture.role}`);
    return {...fixture,bootstrapUrl,runtimeUrl:process.env.DATABASE_URL};
  } catch(error){await fixture.dispose();throw error;}
}
