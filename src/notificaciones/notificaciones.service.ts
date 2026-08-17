import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.module';

export interface EnviarNotificacionParams {
  destinatarioId: string;
  tipo: string;
  mensaje: string;
  titulo?: string;
  trabajoId?: string;
  // Opcional: si no se manda, se busca el token que el usuario haya
  // registrado con registrarToken(). Pensado para que quien dispara la
  // notificación (ej. el backend de trabajos) no tenga que conocer tokens.
  expoPushToken?: string;
}

export interface RegistrarTokenParams {
  usuarioId: string;
  expoPushToken: string;
}

interface SupabaseSingleResult<T> {
  data: T | null;
  error: PostgrestError | null;
}

export interface NotificacionRow {
  id: string;
  destinatario_id: string;
  tipo: string;
  trabajo_id: string | null;
  titulo: string | null;
  mensaje: string;
  estado_envio: string;
  enviado_en: string;
}

@Injectable()
export class NotificacionesService {
  private readonly expo = new Expo();

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async enviarNotificacion(
    params: EnviarNotificacionParams,
  ): Promise<NotificacionRow> {
    const { destinatarioId, tipo, mensaje, titulo, trabajoId } = params;

    const expoPushToken =
      params.expoPushToken ?? (await this.buscarToken(destinatarioId));

    // Se registra como "pendiente" ANTES de mandar el push: si esto falla,
    // cortamos acá y no se llega a mandar nada, así nunca hay un push real
    // que quede sin rastro en el registro.
    const {
      data: registro,
      error: insertError,
    }: SupabaseSingleResult<NotificacionRow> = await this.supabase
      .from('notificaciones')
      .insert({
        destinatario_id: destinatarioId,
        tipo,
        trabajo_id: trabajoId ?? null,
        titulo: titulo ?? 'ChanguitApp',
        mensaje,
        estado_envio: 'pendiente',
      })
      .select()
      .single();

    if (insertError || !registro) {
      throw new BadRequestException('Error al registrar la notificación.');
    }

    // Sin token válido (usuario nunca lo registró, o notificaciones
    // desactivadas) no se manda el push, pero igual queda el registro
    // arriba como "fallido" — no debe frenar a quien dispara la notificación.
    const estadoEnvio =
      expoPushToken && Expo.isExpoPushToken(expoPushToken)
        ? await this.intentarEnviarPush({
            to: expoPushToken,
            sound: 'default',
            title: titulo ?? 'ChanguitApp',
            body: mensaje,
            data: { tipo, trabajoId },
          })
        : 'fallido';

    const {
      data: actualizado,
      error: updateError,
    }: SupabaseSingleResult<NotificacionRow> = await this.supabase
      .from('notificaciones')
      .update({ estado_envio: estadoEnvio })
      .eq('id', registro.id)
      .select()
      .single();

    if (updateError || !actualizado) {
      throw new BadRequestException(
        'Error al actualizar el estado de la notificación.',
      );
    }

    return actualizado;
  }

  private async intentarEnviarPush(
    push: ExpoPushMessage,
  ): Promise<'enviado' | 'fallido'> {
    try {
      const [ticket] = await this.expo.sendPushNotificationsAsync([push]);
      // Expo no tira excepción por token inválido/no registrado: hay que
      // revisar el "ticket" que devuelve, no alcanza con que la llamada no falle.
      return ticket?.status === 'ok' ? 'enviado' : 'fallido';
    } catch {
      return 'fallido';
    }
  }

  async registrarToken(params: RegistrarTokenParams): Promise<void> {
    const { usuarioId, expoPushToken } = params;

    if (!Expo.isExpoPushToken(expoPushToken)) {
      throw new BadRequestException('El expoPushToken no es válido.');
    }

    const { error } = await this.supabase
      .from('push_tokens')
      .upsert(
        { usuario_id: usuarioId, expo_push_token: expoPushToken },
        { onConflict: 'usuario_id' },
      );

    if (error) {
      throw new BadRequestException('Error al registrar el token.');
    }
  }

  private async buscarToken(usuarioId: string): Promise<string | undefined> {
    const { data } = await this.supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    return (data?.expo_push_token as string | undefined) ?? undefined;
  }

  async listarNotificaciones(
    destinatarioId: string,
  ): Promise<NotificacionRow[]> {
    const { data, error } = await this.supabase
      .from('notificaciones')
      .select('*')
      .eq('destinatario_id', destinatarioId)
      .order('enviado_en', { ascending: false });

    if (error)
      throw new BadRequestException('Error al obtener las notificaciones.');

    return (data ?? []) as NotificacionRow[];
  }
}
