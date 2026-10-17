# Contribuer à Creator Studio

Merci de contribuer à l’atelier ! Les améliorations du confort d’utilisation, de l’accessibilité et de la génération Bedrock sont bienvenues.

## Signaler un problème

Indiquez le système, la version de Node.js (`node --version`), le navigateur et la version Minecraft ciblée. Décrivez les étapes pour reproduire le problème, le résultat attendu et le résultat observé. Une capture d’écran ou un petit projet d’exemple aide à comprendre le souci.

Ne joignez pas de fichier `.env`, d’adresse de serveur privée ou de dossier `data/` complet. Pour un problème d’export, utilisez un exemple minimal sans données personnelles.

## Proposer une modification

1. Installez les dépendances avec `npm ci`.
2. Limitez chaque modification à un problème ou une amélioration identifiable.
3. Pour l’interface, vérifiez les thèmes clair et sombre, le clavier et une petite largeur d’écran.
4. Pour un générateur, ajoutez un test qui vérifie le comportement attendu dans les fichiers Bedrock.
5. Exécutez `npm test` et `npm run check`.
6. Décrivez le changement et les vérifications effectuées dans votre pull request.

Gardez les appels API existants cohérents entre l’interface et le serveur. Les modifications de thème se trouvent dans `src/server/ui/studio.css` ; les générateurs sont dans `src/core/generators/bedrock/`.
