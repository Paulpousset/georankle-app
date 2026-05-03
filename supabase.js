import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://exwfggaytrywnfzcqpel.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4d2ZnZ2F5dHJ5d25memNxcGVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NDA5NjAsImV4cCI6MjA5MjUxNjk2MH0.AZkKT-wiJppVpFl3Pz2i_nwHGCSEng7escy6aO_lFOs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
