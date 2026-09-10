import { Global, Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: () =>
        createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY),
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class SupabaseModule {}
