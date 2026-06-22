import { useState, useRef, useEffect } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabaseClient'; // solo para Storage
import { registrarEmpleado } from '../auth';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [coordenadas, setCoordenadas] = useState<{ lat: number; lng: number } | null>(null);

  // Animación de entrada de la pantalla de transición "Ya casi estamos"
  const transAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (paso === 3) {
      transAnim.setValue(0);
      Animated.spring(transAnim, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }).start();
    }
  }, [paso, transAnim]);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    password2: '',
    fecha_nacimiento: '',
    dni: '',
    codigo_postal: '',
    direccion: '',
    radio_busqueda: '',
  });

  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null);
  const [fotoDni, setFotoDni] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function actualizar(campo: string, valor: string) {
    setForm(prev => ({ ...prev, [campo]: valor }));
  }

  async function seleccionarFoto(tipo: 'perfil' | 'dni') {
    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });

    if (!resultado.canceled) {
      if (tipo === 'perfil') setFotoPerfil(resultado.assets[0].uri);
      else setFotoDni(resultado.assets[0].uri);
    }
  }

  async function subirFoto(uri: string, bucket: string, userId: string) {
    const ext = uri.split('.').pop();
    const fileName = `employee/${form.dni}.${ext}`;  // ← DNI en lugar de userId

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });
    const blob = await fetch(`data:image/${ext};base64,${base64}`).then(r => r.blob());

    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, blob, { upsert: true, contentType: `image/${ext}` });

    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  }

  // Valida el paso 1 (credenciales + datos personales) antes de avanzar
  function irAlPaso2() {
    setError('');

    if (!form.email || !form.password || !form.password2 || !form.nombre || !form.apellido || !form.fecha_nacimiento || !form.dni) {
      setError('Completá todos los campos obligatorios.');
      return;
    }
    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    const partes = form.fecha_nacimiento.split('/');
    if (
      partes.length !== 3 ||
      partes[0].length !== 2 ||
      partes[1].length !== 2 ||
      partes[2].length !== 4 ||
      isNaN(Number(partes[0])) ||
      isNaN(Number(partes[1])) ||
      isNaN(Number(partes[2]))
    ) {
      setError('La fecha debe tener el formato DD/MM/AAAA.');
      return;
    }
    setPaso(2);
  }

  // Valida el paso 2 (ubicación) antes de pasar a la transición "Ya casi estamos"
  function irAlPaso3() {
    setError('');
    if (!form.codigo_postal || !form.direccion) {
      setError('Completá todos los campos obligatorios.');
      return;
    }
    setPaso(3);
  }

  async function handleRegistro() {
    setError('');
  
    // 1 — Validar fotos
    if (!fotoPerfil || !fotoDni) {
      setError('Subí tu foto de perfil y la foto del DNI para verificar tu identidad.');
      return;
    }
  
    // 2 — Validar campos
    if (!form.nombre || !form.apellido || !form.email || !form.password || !form.password2 || !form.fecha_nacimiento || !form.dni || !form.codigo_postal || !form.direccion) {
      setError('Completá todos los campos obligatorios.');
      return;
    }
  
    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
  
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
  
    const partes = form.fecha_nacimiento.split('/');
    if (
      partes.length !== 3 ||
      partes[0].length !== 2 ||
      partes[1].length !== 2 ||
      partes[2].length !== 4 ||
      isNaN(Number(partes[0])) ||
      isNaN(Number(partes[1])) ||
      isNaN(Number(partes[2]))
    ) {
      setError('La fecha debe tener el formato DD/MM/AAAA.');
      return;
    }
  
    const fechaFormateada = `${partes[2]}-${partes[1]}-${partes[0]}`;
  
    setCargando(true);
  
    // 3 — Verificar DNI duplicado
    const { data: dniExistente } = await supabase
      .from('empleados')
      .select('id')
      .eq('dni', form.dni);
  
    if (dniExistente && dniExistente.length > 0) {
      setError('Ya existe un usuario registrado con ese DNI.');
      setCargando(false);
      return;
    }
  
    // 4 — Verificar identidad con AWS ANTES de crear el usuario
    try {
      const formData = new FormData();
  
      const responseDni = await fetch(fotoDni!);
      const blobDni = await responseDni.blob();
      formData.append('imagenes', blobDni, `dni-${form.dni}.jpg`);
  
      const responseSelfie = await fetch(fotoPerfil!);
      const blobSelfie = await responseSelfie.blob();
      formData.append('imagenes', blobSelfie, `selfie-${form.dni}.jpg`);
  
      formData.append('userId', form.dni);
  
      const verificacion = await fetch('https://TU_URL.ngrok-free.app/verificacion/comparar-caras', {
        method: 'POST',
        body: formData,
      });
  
      const resultado = await verificacion.json();
      console.log('Resultado AWS:', resultado);
  
      if (resultado.estado !== 'aprobado') {
        setError(`Verificación rechazada: las fotos no coinciden (similitud: ${resultado.similitud?.toFixed(1)}%)`);
        setCargando(false);
        return;
      }
  
    } catch (e: any) {
      setError('Error al verificar identidad: ' + e.message);
      setCargando(false);
      return;
    }
  
    // 5 — Subir fotos a Supabase Storage (sin auth requerida para storage)
    let fotoPerfilUrl = null;
    let fotoDniUrl = null;

    try {
      fotoPerfilUrl = await subirFoto(fotoPerfil!, 'fotos-perfil', '');
      fotoDniUrl    = await subirFoto(fotoDni!,    'fotos-dni',    '');
    } catch (e: any) {
      setError('Error al subir las fotos: ' + e.message);
      setCargando(false);
      return;
    }

    // 6 — Registrar en el backend (crea usuario + perfil en empleados)
    try {
      await registrarEmpleado({
        email:           form.email,
        password:        form.password,
        nombre:          form.nombre,
        apellido:        form.apellido,
        fechaNacimiento: fechaFormateada,
        dni:             form.dni,
        codigoPostal:    form.codigo_postal,
        direccion:       form.direccion,
        radioBusqueda:   parseFloat(form.radio_busqueda) || 10,
        fotoUrl:         fotoPerfilUrl,
        fotoDniUrl:      fotoDniUrl,
        lat:             coordenadas?.lat ?? null,
        lng:             coordenadas?.lng ?? null,
      });
    } catch (e: any) {
      // Limpiar fotos si el backend falla
      await supabase.storage.from('fotos-perfil').remove([`employee/${form.dni}`]);
      await supabase.storage.from('fotos-dni').remove([`employee/${form.dni}`]);
      setError(e.message || 'Error al crear la cuenta');
      setCargando(false);
      return;
    }

    setCargando(false);
    router.replace('/(tabs)/buscar' as any);
  }
  function formatearFecha(valor: string) {
    const soloNumeros = valor.replace(/\D/g, '');
    if (soloNumeros.length <= 2) return soloNumeros;
    if (soloNumeros.length <= 4) return `${soloNumeros.slice(0, 2)}/${soloNumeros.slice(2)}`;
    return `${soloNumeros.slice(0, 2)}/${soloNumeros.slice(2, 4)}/${soloNumeros.slice(4, 8)}`;
  }
  const inputClass = 'bg-[#262626] rounded-[10px] px-4 py-3.5 mb-4 text-base text-white border border-[#3a3a3a]';
  
  async function buscarCoordenadas(direccion: string) {
    if (direccion.length < 5) return;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion)}&format=json&limit=1&countrycodes=ar`,
        { headers: { 'User-Agent': 'ChanguitApp/1.0 contacto@changuitapp.com' } }
      );
      const text = await response.text();
      const data = JSON.parse(text);
      if (data && data.length > 0) {
        setCoordenadas({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        });
      }
    } catch (e) {
      console.log('Error geocodificando:', e);
    }
  }
  return (
    <ScrollView
      className="flex-1 bg-[#1a1a1a]"
      contentContainerStyle={{
        paddingHorizontal: 28,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 32,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center gap-2.5 mb-7">
        <View className="w-11 h-11 rounded-xl bg-[#FFD942] items-center justify-center">
          <Text className="text-2xl font-black text-[#1a1a1a]">C</Text>
        </View>
        <Text className="text-[13px] font-bold tracking-[2px] text-[#FFD942]">EMPLOYEE</Text>
      </View>

      {paso === 1 ? (
        <>
          <Text className="text-3xl font-bold text-white mb-1">
            Creá tu cuenta en{'\n'}
            <Text className="text-[#FFD942]">ChanguitApp</Text>
          </Text>
          <Pressable onPress={() => router.replace('/')} className="mb-7">
            <Text className="text-sm text-[#94a3b8]">
              ¿Ya tenés una cuenta? <Text className="text-[#FFD942] font-semibold">Iniciá sesión</Text>
            </Text>
          </Pressable>

          <TextInput className={inputClass} placeholder="Ingresá tu mail" placeholderTextColor="#64748b"
            value={form.email} onChangeText={v => actualizar('email', v)}
            autoCapitalize="none" keyboardType="email-address"
            autoComplete="off" textContentType="none" importantForAutofill="no"
            autoCorrect={false} spellCheck={false} />

          <TextInput className={inputClass} placeholder="Ingresá tu contraseña" placeholderTextColor="#64748b"
            value={form.password} onChangeText={v => actualizar('password', v)} secureTextEntry />

          <TextInput className={inputClass} placeholder="Volvé a ingresar tu contraseña" placeholderTextColor="#64748b"
            value={form.password2} onChangeText={v => actualizar('password2', v)} secureTextEntry />

          <Text className="text-base font-bold text-white mt-2 mb-3">Datos personales</Text>

          <TextInput className={inputClass} placeholder="Nombre/s" placeholderTextColor="#64748b"
            value={form.nombre} onChangeText={v => actualizar('nombre', v)} />

          <TextInput className={inputClass} placeholder="Apellido/s" placeholderTextColor="#64748b"
            value={form.apellido} onChangeText={v => actualizar('apellido', v)} />

          <TextInput className={inputClass} placeholder="Fecha de nacimiento (DD/MM/AAAA)" placeholderTextColor="#64748b"
            value={form.fecha_nacimiento} onChangeText={v => actualizar('fecha_nacimiento', formatearFecha(v))}
            keyboardType="numeric" />

          <TextInput className={inputClass} placeholder="DNI / CUIT" placeholderTextColor="#64748b"
            value={form.dni} onChangeText={v => actualizar('dni', v)}
            keyboardType="numeric" />

          {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
            onPress={irAlPaso2}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">Siguiente</Text>
          </Pressable>
        </>
      ) : paso === 2 ? (
        <>
          <Text className="text-3xl font-bold text-white mb-1">Ya falta poco</Text>
          <Text className="text-sm text-[#94a3b8] mb-7">
            Te pedimos solo un poco más de paciencia
          </Text>

          <TextInput className={inputClass} placeholder="Ingresá tu código postal" placeholderTextColor="#64748b"
            value={form.codigo_postal} onChangeText={v => actualizar('codigo_postal', v)}
            keyboardType="numeric" />

          <TextInput className={inputClass} placeholder="Dirección personal" placeholderTextColor="#64748b"
            value={form.direccion}
            onChangeText={v => {
              actualizar('direccion', v);
              if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
              geocodeTimer.current = setTimeout(() => buscarCoordenadas(v), 600);
            }} />

          {coordenadas && (
            <View style={{ height: 180, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
              <WebView
                source={{
                  html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <meta name="viewport" content="width=device-width, initial-scale=1">
                      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
                      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                      <style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
                    </head>
                    <body>
                      <div id="map"></div>
                      <script>
                        var map = L.map('map').setView([${coordenadas.lat}, ${coordenadas.lng}], 16);
                        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
                        L.marker([${coordenadas.lat}, ${coordenadas.lng}]).addTo(map);
                      </script>
                    </body>
                    </html>
                  `
                }}
                style={{ flex: 1 }}
                scrollEnabled={false}
              />
            </View>
          )}

          {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
            onPress={irAlPaso3}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">Siguiente</Text>
          </Pressable>

          <Pressable onPress={() => { setError(''); setPaso(1); }} className="mt-4 items-center">
            <Text className="text-[#94a3b8] text-sm underline">Volver</Text>
          </Pressable>
        </>
      ) : paso === 3 ? (
        <Animated.View
          style={{
            opacity: transAnim,
            transform: [
              { translateY: transAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            ],
          }}
          className="items-center pt-6">
          {/* Ícono celebratorio */}
          <Animated.View
            style={{
              transform: [
                { scale: transAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            }}
            className="w-28 h-28 rounded-full bg-[#FFD942] items-center justify-center mb-8">
            <MaterialIcons name="verified-user" size={56} color="#1a1a1a" />
          </Animated.View>

          <Text className="text-4xl font-black text-white text-center mb-3">
            ¡Ya casi{'\n'}
            <Text className="text-[#FFD942]">estamos!</Text>
          </Text>

          <Text className="text-base text-[#cbd5e1] text-center leading-6 mb-2 px-2">
            Solo nos falta verificar tu identidad.
          </Text>
          <Text className="text-sm text-[#94a3b8] text-center leading-5 mb-10 px-2">
            En el último paso te vamos a pedir una foto de tu DNI y una selfie para confirmar que sos vos.
          </Text>

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 w-full items-center active:opacity-90"
            onPress={() => setPaso(4)}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">Continuar</Text>
          </Pressable>

          <Pressable onPress={() => { setError(''); setPaso(2); }} className="mt-4 items-center">
            <Text className="text-[#94a3b8] text-sm underline">Volver</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <>
          <Text className="text-3xl font-bold text-white mb-1">Por último...</Text>
          <Text className="text-sm text-[#94a3b8] mb-6">
            Completá estos datos para terminar de configurar tu perfil
          </Text>

          {/* Foto de perfil */}
          <Pressable
            onPress={() => seleccionarFoto('perfil')}
            className="flex-row items-center bg-[#262626] rounded-xl p-4 mb-3 border border-[#3a3a3a] active:opacity-70">
            <View className="w-14 h-14 rounded-full bg-[#3a3a3a] items-center justify-center overflow-hidden">
              {fotoPerfil ? (
                <Image source={{ uri: fotoPerfil }} className="w-14 h-14" />
              ) : (
                <MaterialIcons name="person" size={30} color="#94a3b8" />
              )}
            </View>
            <Text className="flex-1 text-[#cbd5e1] text-sm ml-3">
              {fotoPerfil
                ? '✓ Foto de perfil cargada'
                : 'Subí tu foto de perfil para que podamos reconocerte mejor'}
            </Text>
          </Pressable>

          {/* Foto del DNI */}
          <Pressable
            onPress={() => seleccionarFoto('dni')}
            className="flex-row items-center bg-[#262626] rounded-xl p-4 mb-3 border border-[#3a3a3a] active:opacity-70">
            <View className="w-14 h-14 rounded-lg bg-[#3a3a3a] items-center justify-center overflow-hidden">
              {fotoDni ? (
                <Image source={{ uri: fotoDni }} className="w-14 h-14" />
              ) : (
                <MaterialIcons name="badge" size={30} color="#94a3b8" />
              )}
            </View>
            <Text className="flex-1 text-[#cbd5e1] text-sm ml-3">
              {fotoDni
                ? '✓ Foto del DNI cargada'
                : 'Agregá una foto de tu DNI para verificar tu identidad'}
            </Text>
          </Pressable>

          <View className="flex-row items-start bg-[#1f2937] rounded-lg p-3 mb-5">
            <MaterialIcons name="verified-user" size={18} color="#FFD942" />
            <Text className="flex-1 text-[#94a3b8] text-xs ml-2 leading-4">
              Comparamos la foto de tu DNI con tu foto de perfil para confirmar que sos vos.
            </Text>
          </View>

          {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

          <Pressable
            className="bg-[#FFD942] rounded-xl py-4 items-center active:opacity-90"
            onPress={handleRegistro}
            disabled={cargando}>
            <Text className="text-[#1a1a1a] text-base font-extrabold">
              {cargando ? 'Creando cuenta...' : 'Continuar a inicio'}
            </Text>
          </Pressable>

          <Text className="text-[11px] text-[#64748b] text-center mt-4 leading-4">
            Al crear una cuenta automáticamente aceptás nuestra{' '}
            <Text className="underline">política de privacidad</Text> y{' '}
            <Text className="underline">acuerdo de usuario</Text>
          </Text>

          <Pressable onPress={() => { setError(''); setPaso(3); }} className="mt-4 items-center">
            <Text className="text-[#94a3b8] text-sm underline">Volver</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}
