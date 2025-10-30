// Polyfills required for Supabase in React Native/Expo
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (Constants.expoConfig?.extra as any)?.SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (Constants.expoConfig?.extra as any)?.SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as ReturnType<typeof createClient>);


