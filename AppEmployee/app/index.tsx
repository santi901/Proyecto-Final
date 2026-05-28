import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabaseClient';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  // Si ya hay sesión activa, entra directo al panel
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
    });
  }, [router]);

  async function handleLogin() {
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email,
      password: pass,
    });
    if (error) {
      setError(error.message);
    } else {
      router.replace('/dashboard');
    }
  }

  const Marca = () => (
    <View className="flex-row items-center gap-2.5 mb-9">
      <View className="w-11 h-11 rounded-xl bg-[#FFD942] items-center justify-center">
        <Text className="text-2xl font-black text-[#1a1a1a]">C</Text>
      </View>
      <Text className="text-[13px] font-bold tracking-[2px] text-[#FFD942]">EMPLOYEE</Text>
    </View>
  );

  if (!mostrarLogin) {
    return (
      <ScrollView
        className="flex-1 bg-[#1a1a1a]"
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

            <Text className="text-3xl font-bold text-white leading-10 mb-7">
              Bienvenido/a a{'\n'}
              <Text className="text-[#FFD942]">ChanguitApp</Text>
            </Text>

            <Text className="text-[15px] leading-6 text-[#cbd5e1] mb-5">
              Trabajá y ganá en ChanguitApp, nuestra aplicación para trabajadores
              y jóvenes adultos que buscan generar dinero fácilmente haciendo
              trabajos que requieren poco tiempo
            </Text>

            <Text className="text-[15px] leading-6 text-[#cbd5e1] mb-5">
              El tiempo es dinero... ¿Te sobra tiempo?{' '}
              <Text className="text-[#FFD942] font-bold">Descargá también</Text> ChanguitApp
              Employer para poder ofrecer trabajos usando una misma cuenta y perfil
            </Text>
          </View>

          <View className="gap-3">
            <Pressable
              className="bg-[#FFD942] rounded-xl py-4 items-center active:opacity-90"
              onPress={() => router.push('/register')}>
              <Text className="text-[#1a1a1a] text-base font-extrabold">Creá una cuenta</Text>
            </Pressable>

            <Pressable
              className="rounded-xl py-4 items-center border-[1.5px] border-[#FFD942] active:opacity-70"
              onPress={() => setMostrarLogin(true)}>
              <Text className="text-[#FFD942] text-base font-bold">Iniciá sesión</Text>
            </Pressable>

            <Pressable onPress={() => {}}>
              <Text className="text-[#94a3b8] text-sm text-center underline mt-2.5">Ayuda</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-[#1a1a1a]"
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

      <Text className="text-3xl font-bold text-white">Iniciá sesión</Text>
      <Text className="text-[15px] text-[#94a3b8] mb-7">Ingresá con tu cuenta de trabajador</Text>

      <Text className="text-[13px] font-semibold text-[#cbd5e1] mb-1.5">Email</Text>
      <TextInput
        className="bg-[#262626] rounded-[10px] px-4 py-3.5 mb-4 text-base text-white border border-[#3a3a3a]"
        placeholder="tu@email.com"
        placeholderTextColor="#64748b"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Text className="text-[13px] font-semibold text-[#cbd5e1] mb-1.5">Contraseña</Text>
      <TextInput
        className="bg-[#262626] rounded-[10px] px-4 py-3.5 mb-4 text-base text-white border border-[#3a3a3a]"
        placeholder="Tu contraseña"
        placeholderTextColor="#64748b"
        value={pass}
        onChangeText={setPass}
        secureTextEntry
      />

      {error ? <Text className="text-[#fca5a5] text-center mb-2 text-[13px]">{error}</Text> : null}

      <Pressable
        className="bg-[#FFD942] rounded-xl py-4 items-center mt-2 active:opacity-90"
        onPress={handleLogin}>
        <Text className="text-[#1a1a1a] text-base font-extrabold">Ingresar</Text>
      </Pressable>

      <Pressable
        className="rounded-xl py-4 items-center mt-3 border-[1.5px] border-[#FFD942] active:opacity-70"
        onPress={() => router.push('/register')}>
        <Text className="text-[#FFD942] text-base font-bold">Crear cuenta</Text>
      </Pressable>

      <Pressable onPress={() => setMostrarLogin(false)}>
        <Text className="text-[#94a3b8] text-sm text-center underline mt-5">Volver</Text>
      </Pressable>
    </ScrollView>
  );
}
