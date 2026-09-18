import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * Lógica compartida para que el teclado del celular no tape el campo que se está
 * completando. La usan `VistaFormulario` (pantallas de formulario) y
 * `PanelDeslizable` (el panel que se apoya sobre el mapa).
 *
 * En Android moderno (edge-to-edge) `adjustResize` ya no achica la ventana y en iOS el
 * teclado se dibuja encima, así que no alcanza con `KeyboardAvoidingView`: hay que medir
 * el campo enfocado a mano y desplazar el scroll lo justo para dejarlo a la vista.
 */

/** Aire que queda entre el campo enfocado y el borde superior del teclado. */
const MARGEN = 24;

/** Algo que se puede medir en pantalla: lo que devuelve el ref de un `TextInput`. */
export type Medible = {
  measureInWindow: (cb: (x: number, y: number, ancho: number, alto: number) => void) => void;
};

export const ContextoFoco = createContext<((campo: Medible | null) => void) | null>(null);

/**
 * Lo usan los campos (`CampoTexto`) para avisar que tomaron el foco.
 * Devuelve `null` si el campo no está dentro de un contenedor que maneje el teclado.
 */
export function useAvisarFoco() {
  return useContext(ContextoFoco);
}

type Opciones = {
  /** Se llama cuando aparece el teclado, antes de acomodar el campo. */
  alAbrirTeclado?: () => void;
};

/**
 * Devuelve lo necesario para conectar un `ScrollView` con el teclado: el ref del scroll,
 * cuánto espacio hay que agregarle al final, el aviso de foco para el contexto y el
 * handler de scroll.
 */
export function useTecladoEnScroll({ alAbrirTeclado }: Opciones = {}) {
  const refScroll = useRef<ScrollView>(null);
  /** Desplazamiento actual del scroll, para poder calcular a dónde hay que ir. */
  const desplazamiento = useRef(0);
  /** Último campo que tomó el foco. */
  const campoActivo = useRef<Medible | null>(null);
  /** Alto del teclado en un ref además de en el estado: lo leen los listeners. */
  const altoTeclado = useRef(0);
  const [espacioTeclado, setEspacioTeclado] = useState(0);

  const alAbrir = useRef(alAbrirTeclado);
  useEffect(() => { alAbrir.current = alAbrirTeclado; }, [alAbrirTeclado]);

  // Desplaza el scroll lo mínimo necesario para que el campo enfocado quede visible
  // por encima del teclado. Si ya se ve, no toca nada.
  const acomodar = useCallback(() => {
    const teclado = altoTeclado.current;
    const campo = campoActivo.current;
    if (teclado === 0 || !campo || !refScroll.current) return;

    campo.measureInWindow((_x, y, _ancho, alto) => {
      const bordeDelTeclado = Dimensions.get('window').height - teclado - MARGEN;
      const excedente = y + alto - bordeDelTeclado;
      if (excedente > 1) {
        refScroll.current?.scrollTo({ y: desplazamiento.current + excedente, animated: true });
      }
    });
  }, []);

  const avisarFoco = useCallback(
    (campo: Medible | null) => {
      campoActivo.current = campo;
      // Si el teclado ya estaba abierto (se pasó de un campo a otro) hay que
      // reacomodar acá, porque no va a volver a dispararse el evento de apertura.
      if (altoTeclado.current > 0) setTimeout(acomodar, 50);
    },
    [acomodar],
  );

  useEffect(() => {
    const abre = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const cierra = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const suscripcionAbrir = Keyboard.addListener(abre, evento => {
      const alto = evento.endCoordinates?.height ?? 0;
      altoTeclado.current = alto;
      setEspacioTeclado(alto);
      alAbrir.current?.();
      // Se espera a que el layout tenga el espacio nuevo antes de medir el campo.
      setTimeout(acomodar, Platform.OS === 'ios' ? 60 : 160);
    });

    const suscripcionCerrar = Keyboard.addListener(cierra, () => {
      altoTeclado.current = 0;
      setEspacioTeclado(0);
    });

    return () => { suscripcionAbrir.remove(); suscripcionCerrar.remove(); };
  }, [acomodar]);

  function alDesplazar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    desplazamiento.current = evento.nativeEvent.contentOffset.y;
  }

  return { refScroll, espacioTeclado, avisarFoco, alDesplazar };
}
