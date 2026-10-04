// ⚠️ Remplace ces 2 valeurs (Supabase → Project Settings → API).
// Utilise UNIQUEMENT la clé "anon / public". JAMAIS la clé service_role.
const SUPABASE_URL = 'https://stjhjobbvabpqwzyertk.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0amhqb2JidmFicHF3enllcnRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjcwMjQsImV4cCI6MjEwNjcwMzAyNH0.FrwIH0X8SiuQCfdAEcoLP6guVFALR4mmYTwKrCqfNl4';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

// Prix : nombre en base, affiché avec 🎾 (jamais d'euro)
const price = n => `${Number(n)} 🎾`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pub = (bucket, path) => sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;

// Accepte "@pseudo", "pseudo" ou une URL complète
const handle = s => String(s || '').trim().replace(/^https?:\/\/[^/]+\/(add\/)?/, '').replace(/^@/, '').replace(/\/$/, '');
