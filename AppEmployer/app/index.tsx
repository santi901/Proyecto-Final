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
      if (await tieneSesion()) { router.replace('/(tabs)/ofrecer' as any); return; }
      if (!(await onboardingVisto())) { router.replace('/onboarding' as any); return; }
      setVerificandoSesion(false);
    })();
  }, [router]);

  async function handleLogin() {
    setError('');
    try {
      await login(email, pass);
      router.replace('/(tabs)/ofrecer' as any);
    } catch (e: any) {
      setError(e.message || 'Error al iniciar sesión');
    }
  }

  const Marca = () => (
    <View className="flex-row items-center gap-2.5 mb-9">
      <View className="w-11 h-11 rounded-xl bg-acento items-center justify-center">
        <Text className="text-2xl font-nunito-bold text-principal">C</Text>
      </View>
      <Text className="text-[13px] font-nunito-bold tracking-[2px] text-principal">EMPLOYER</Text>
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
              Bienvenido/a a{'\n'}ChanguitApp Employer
            </Text>

            <Text className="text-[15px] font-nunito leading-6 text-neutro mb-5">
              Ofrecé trabajo en ChanguitApp Employer, nuestra aplicación destinada
              a aquellos que quieren delegar sus aburridas tareas a gente que pueda
              hacerlas con facilidad
            </Text>

            <Text className="text-[15px] font-nunito leading-6 text-neutro mb-5">
              El tiempo es dinero... ¿Tenés dinero?{' '}
              <Text className="text-principal font-nunito-semi">Descargá también</Text> ChanguitApp
              para poder ofrecer trabajos usando una misma cuenta y perfil
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

      <Text className="text-3xl font-nunito-bold text-principal mb-7">
        Iniciá sesión en{'\n'}ChanguitApp Employer
      </Text>

      <TextInput
        className="bg-white rounded-[10px] px-4 py-3.5 mb-4 text-base font-nunito text-principal border border-neutro"
        placeholder="Ingresá tu mail"
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
      <TextInput
        className="bg-white rounded-[10px] px-4 py-3.5 mb-4 text-base font-nunito text-principal border border-neutro"
        placeholder="Ingresá tu contraseña"
        placeholderTextColor={Paleta.neutro}
        value={pass}
        onChangeText={setPass}
        secureTextEntry
      />

      {error ? <Text className="text-error font-nunito text-center mb-2 text-[13px]">{error}</Text> : null}

      <Pressable
        className="bg-principal rounded-xl py-4 items-center mt-2 active:opacity-90"
        onPress={handleLogin}>
        <Text className="text-white text-base font-nunito-bold">Iniciar sesión</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/register')} className="mt-5">
        <Text className="text-sm font-nunito text-neutro text-center">
          ¿No tenés una cuenta?{' '}
          <Text className="text-principal font-nunito-semi">Creá una de forma gratis e inmediata</Text>
        </Text>
      </Pressable>

      <Text className="text-[11px] font-nunito text-neutro text-center mt-5 leading-4">
        Al iniciar sesión automáticamente aceptás nuestra{' '}
        <Text className="underline">política de privacidad</Text> y{' '}
        <Text className="underline">acuerdo de usuario</Text>
      </Text>

      <Pressable onPress={() => {}} className="mt-4">
        <Text className="text-neutro text-sm font-nunito text-center underline">Ayuda</Text>
      </Pressable>

      <Pressable onPress={() => setMostrarLogin(false)}>
        <Text className="text-neutro text-sm font-nunito text-center underline mt-4">Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
