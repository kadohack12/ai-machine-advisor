# AI Machine Advisor

Interface web qui analyse votre machine (RAM, VRAM, GPU, CPU) et recommande les
modèles d'IA que vous pouvez réellement faire tourner — en local (Ollama) ou via API.

**100 % côté navigateur** : aucune donnée n'est envoyée à un serveur, aucun backend.

## ✨ Fonctionnalités

- **Estimation d'empreinte mémoire** selon la quantification (Q4/Q5/Q8) et le KV cache.
- **Vitesse estimée** (tokens/s) à partir de la bande passante mémoire réelle du matériel.
- **Classement pondéré** qualité × vitesse × adéquation à votre usage.
- **Détection automatique** du matériel quand le navigateur l'expose (`deviceMemory`, WebGL).
- **Commande prête à copier** (`ollama run …`) pour chaque modèle.
- **Alternatives API** si la machine ne suffit pas.

## 🚀 Utilisation

Aucune installation : ouvrez `index.html` dans un navigateur.

En local :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## 🌐 Déploiement

Le site est statique : n'importe quel hébergeur convient (Vercel, Netlify, GitHub Pages).

```bash
vercel --prod
```

## 🧠 Comment fonctionne la recommandation

| Étape | Calcul |
|---|---|
| Empreinte | `params × octets/param` (Q4 ≈ 0.58, Q5 ≈ 0.70, Q8 ≈ 1.05) + surcoût moteur |
| Capacité | VRAM + RAM partagée (GPU dédié), RAM × 0.72 (Apple), RAM × 0.80 (CPU) |
| Vitesse | `bande passante ÷ taille du modèle`, pénalisée en cas de débordement VRAM |
| Score | `qualité × facteur de vitesse (log) × bonus d'usage` |

Les estimations sont **indicatives** : le débit réel dépend du moteur d'inférence
(llama.cpp, vLLM, MLX…), de la quantification exacte et du contexte utilisé.

## 📁 Structure

```
index.html        interface
styles.css        thème sombre
app.js            moteur de recommandation
data/models.js    catalogue de modèles + bandes passantes GPU
```

## ➕ Ajouter un modèle

Éditez `data/models.js` :

```js
{ id:"mon-modele", name:"Mon Modèle", params:12, quality:70,
  tags:["chat","code"], ctx:"128k",
  ollama:"ollama run mon-modele", desc:"Description courte." }
```

## 📄 Licence

MIT — voir [LICENSE](LICENSE).

---

Projet par [KadoHackLabs](https://kadohacklabs.blogspot.com/).
