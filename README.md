# SHOP — mise en route

1. Supabase → SQL Editor → New query → coller `supabase/setup.sql` → Run.
2. Supabase → Authentication → Users → Add user (email + mot de passe, Auto Confirm).
3. SQL Editor : exécuter la requête de la section « SQL 6 » (avec TON email) pour te donner les droits admin.
4. Supabase → Project Settings → API : copier l'URL et la clé `anon public` dans `js/config.js`.
5. Pousser le dossier sur GitHub → Settings → Pages → Deploy from branch (main, /root).
6. Authentication → URL Configuration : mettre l'URL GitHub Pages en Site URL.
7. Ouvrir /admin/login.html, te connecter, créer catégories, produits, QR code, contact.
