import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { login, tieneSesion, onboardingVisto } from '../auth';
import { Paleta } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [verificandoSesion, setVerificandoSesion] = useState(true);

  // Persistencia de sesión + onboarding:
  // 1) si hay sesión activa entra directo al panel,
  // 2) si es la primera vez, muestra el onboarding,
  // 3) si no, muestra la bienvenida (sin parpadeo).
  useEffect(() => {
    (async () => {
      if (await tieneSesion()) { router.replace('/buscar'); return; }
      if (!(await onboardingVisto())) { router.replace('/onboarding' as any); return; }
      setVerificandoSesion(false);
    })();
  }, [router]);

  async function handleLogin() {
    setError('');
    try {
      await login(email, pass);
      router.replace('/buscar');
    } catch (e: any) {
      setError(e.message || 'Error al iniciar sesión');
    }
  }

  const Marca = () => (
    <View className="flex-row items-center gap-2.5 mb-9">
      <View className="w-11 h-11 rounded-xl bg-acento items-center justify-center">
        <Text className="text-2xl font-nunito-bold text-principal">C</Text>
      </View>
      <Text className="text-[13px] font-nunito-bold tracking-[2px] text-principal">EMPLOYEE</Text>
    </View>
  );

  // Mientras se chequea si hay sesión guardada
  if (verificandoSesion) {
    return (
      <View className="flex-1 bg-fondo items-center justify-center">
        <ActivityIndicator size="large" color={Paleta.principal} />
      </View>
    );
  }

  if (!mostrarLogin) {
    return (
      <ScrollView
        className="flex-1 bg-fondo"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 28,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}>
        <View className="grow justify-between">
          <View className="mb-6">
            <Marca />

            <Text className="text-3xl font-nunito-bold text-principal leading-10 mb-7">
              Bienvenido/a a{'\n'}ChanguitApp
            </Text>

            <Text className="text-[15px] font-nunito leading-6 text-neutro mb-5">
              Trabajá y ganá en ChanguitApp, nuestra aplicación para trabajadores
              y jóvenes adultos que buscan generar dinero fácilmente haciendo
              trabajos que requieren poco tiempo
            </Text>

            <Text className="text-[15px] font-nunito leading-6 text-neutro mb-5">
              El tiempo es dinero... ¿Te sobra tiempo?{' '}
              <Text className="text-principal font-nunito-semi">Descargá también</Text> ChanguitApp
              Employer para poder ofrecer trabajos usando una misma cuenta y perfil
            </Text>
          </View>

          <View className="gap-3">
            <Pressable
              className="bg-principal rounded-xl py-4 items-center active:opacity-90"
              onPress={() => router.push('/register')}>
              <Text className="text-white text-base font-nunito-bold">Creá una cuenta</Text>
            </Pressable>

            <Pressable
              className="bg-white rounded-xl py-4 items-center border-[1.5px] border-principal active:opacity-70"
              onPress={() => setMostrarLogin(true)}>
              <Text className="text-principal text-base font-nunito-bold">Iniciá sesión</Text>
            </Pressable>

            <Pressable onPress={() => {}}>
              <Text className="text-neutro text-sm font-nunito text-center underline mt-2.5">Ayuda</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-fondo"
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 28,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        justifyContent: 'center',
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Marca />

      <Text className="text-3xl font-nunito-bold text-principal">Iniciá sesión</Text>
      <Text className="text-[15px] font-nunito text-neutro mb-7">Ingresá con tu cuenta de trabajador</Text>

      <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Email</Text>
      <TextInput
        className="bg-white rounded-[10px] px-4 py-3.5 mb-4 text-base font-nunito text-principal border border-neutro"
        placeholder="tu@email.com"
        placeholderTextColor={Paleta.neutro}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="off"
        textContentType="none"
        importantForAutofill="no"
        autoCorrect={false}
        spellCheck={false}
      />
      <Text className="text-[13px] font-nunito-semi text-principal mb-1.5">Contraseña</Text>
      <TextInput
        className="bg-white rounded-[10px] px-4 py-3.5 mb-4 text-base font-nunito text-principal border border-neutro"
        placeholder="Tu contraseña"
        placeholderTextColor={Paleta.neutro}
        value={pass}
        onChangeText={setPass}
        secureTextEntry
      />

      {error ? <Text className="text-error font-nunito text-center mb-2 text-[13px]">{error}</Text> : null}

      <Pressable
        className="bg-principal rounded-xl py-4 items-center mt-2 active:opacity-90"
        onPress={handleLogin}>
        <Text className="text-white text-base font-nunito-bold">Ingresar</Text>
      </Pressable>

      <Pressable
        className="bg-white rounded-xl py-4 items-center mt-3 border-[1.5px] border-principal active:opacity-70"
        onPress={() => router.push('/register')}>
        <Text className="text-principal text-base font-nunito-bold">Crear cuenta</Text>
      </Pressable>

      <Pressable onPress={() => setMostrarLogin(false)}>
        <Text className="text-neutro text-sm font-nunito text-center underline mt-5">Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
