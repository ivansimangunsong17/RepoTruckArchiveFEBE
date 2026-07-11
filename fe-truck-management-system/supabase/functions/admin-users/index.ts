import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = request.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const adminClient = createClient(url, serviceKey);
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) throw new Error('Sesi tidak valid.');

    const { data: caller } = await adminClient.from('profiles').select('role, status').eq('id', authData.user.id).single();
    if (caller?.role !== 'admin' || caller?.status !== 'active') throw new Error('Hanya Admin yang dapat mengelola user.');

    const body = await request.json();
    let result;

    if (body.action === 'upsert' && !body.id) {
      result = await adminClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.fullName, role: body.role },
      });
    } else if (body.action === 'upsert') {
      const attributes: Record<string, unknown> = {
        email: body.email,
        user_metadata: { full_name: body.fullName, role: body.role },
        ban_duration: body.status === 'inactive' ? '876000h' : 'none',
      };
      if (body.password) attributes.password = body.password;
      result = await adminClient.auth.admin.updateUserById(body.id, attributes);
      if (!result.error) {
        await adminClient.from('profiles').update({
          full_name: body.fullName,
          email: body.email,
          role: body.role,
          status: body.status,
          updated_at: new Date().toISOString(),
        }).eq('id', body.id);
      }
    } else if (body.action === 'deactivate') {
      result = await adminClient.auth.admin.updateUserById(body.id, { ban_duration: '876000h' });
      if (!result.error) await adminClient.from('profiles').update({ status: 'inactive' }).eq('id', body.id);
    } else if (body.action === 'reset') {
      result = await adminClient.auth.admin.generateLink({ type: 'recovery', email: body.email });
    } else {
      throw new Error('Aksi tidak dikenali.');
    }

    if (result.error) throw result.error;
    return new Response(JSON.stringify({ data: result.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
