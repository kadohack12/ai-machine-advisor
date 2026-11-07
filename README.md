# ◈ AI Machine Advisor

[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)
[![Site statique](https://img.shields.io/badge/site-100%25%20statique-success.svg)](#)
[![Sans backend](https://img.shields.io/badge/backend-aucun-informational.svg)](#)
[![Démo en ligne](https://img.shields.io/badge/d%C3%A9mo-en%20ligne-brightgreen.svg)](https://kadohack12.github.io/ai-machine-advisor/)
[![Langue](https://img.shields.io/badge/langue-fran%C3%A7ais-blue.svg)](#)

> **Quel modèle d'IA peut vraiment tourner sur votre machine ?**
> Décrivez votre matériel (RAM, VRAM, GPU) — l'outil calcule les modèles que vous
> pouvez réellement exécuter, les classe par performance réelle, et donne la
> commande d'installation prête à copier.

### 🔗 **[Essayer en ligne →](https://kadohack12.github.io/ai-machine-advisor/)**

[![Aperçu](preview.png)](https://kadohack12.github.io/ai-machine-advisor/)

---

## ✨ Fonctionnalités

| | |
|---|---|
| 🧮 **Empreinte mémoire exacte** | Calcul selon la quantification (Q4/Q5/Q8) + KV cache |
| ⚡ **Vitesse estimée** | En tokens/s, d'après la bande passante mémoire réelle du matériel |
| 🏆 **Classement pondéré** | Qualité × vitesse × adéquation à votre usage |
| 🔍 **Détection automatique** | RAM, cœurs CPU et GPU via `deviceMemory` et WebGL |
| 📋 **Commande prête à copier** | `ollama run …` pour chaque modèle |
| ☁️ **Alternatives API** | Si la machine ne suffit pas (Groq, Gemini, OpenAI, Mistral) |
| 🔒 **100 % local** | Aucune donnée envoyée, aucun backend, aucun tracker |

## 🚀 Utilisation

Aucune installation : ouvrez `index.html`. En local :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## 🧠 Comment fonctionne la recommandation

| Étape | Calcul |
|---|---|
| **Empreinte** | `params × octets/param` (Q4 ≈ 0.58, Q5 ≈ 0.70, Q8 ≈ 1.05) + surcoût moteur |
| **Capacité** | VRAM + RAM partagée (GPU dédié) · RAM × 0.72 (Apple) · RAM × 0.80 (CPU) |
| **Vitesse** | `bande passante ÷ taille du modèle`, pénalisée en cas de débordement VRAM |
| **Score** | `qualité × facteur de vitesse (log) × bonus d'usage` |

> Les estimations sont **indicatives** : le débit réel dépend du moteur
> d'inférence (llama.cpp, vLLM, MLX…), de la quantification exacte et du contexte.

## 🗂️ Modèles couverts

**29 modèles** de 0,5 B à 671 B — Qwen 2.5, Llama 3.1/3.2/3.3, Mistral, Gemma 2,
Phi 3.5/4, DeepSeek Coder V2, DeepSeek R1, Mixtral, Yi, LLaVA…
Plus 4 fournisseurs API pour les machines modestes.

## 📁 Structure

```
index.html        interface (SEO : Open Graph, Twitter Card, JSON-LD)
styles.css        thème sombre responsive
app.js            moteur de recommandation
data/models.js    catalogue de modèles + bandes passantes GPU
preview.svg/png   image de prévisualisation sociale
```

## ➕ Ajouter un modèle

Éditez `data/models.js` :

```js
{ id:"mon-modele", name:"Mon Modèle", params:12, quality:70,
  tags:["chat","code"], ctx:"128k",
  ollama:"ollama run mon-modele", desc:"Description courte." }
```

## 🌐 Déploiement

Site statique — n'importe quel hébergeur convient.

- **GitHub Pages** (actif) : Settings → Pages → branche `main`, dossier `/`
- **Vercel / Netlify** : importez le dépôt, aucune configuration de build

## 🤝 Contribuer

Les ajouts de modèles, corrections d'estimations et traductions sont bienvenus.
Ouvrez une *issue* ou une *pull request*.

## 📄 Licence

MIT — voir [LICENSE](LICENSE).

---

Réalisé par **[KadoHackLabs](https://kadohacklabs.blogspot.com/)** ·
Guide associé : [Installer et configurer une IA en local](https://kadohacklabs.blogspot.com/2026/11/installer-et-configurer-une-ia-en-local.html)

⭐ Si l'outil vous est utile, laissez une étoile — ça aide d'autres personnes à le trouver.
