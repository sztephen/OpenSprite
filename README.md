# opensprite

turn a single character image into a full animation spritesheet using AI — no coding required, runs 100% on your computer.

hand-drawing every frame of an animation takes forever. this tool does it for you. upload your sprite, type what you want it to do (like "walking"), and it generates all the frames.

---

## before you start

opensprite needs an AI image generator running on your computer. this is a one-time setup that takes about 30 minutes (most of that is just waiting for downloads).

you need:
- a computer with a decent GPU (8GB+ VRAM recommended)
- about 25GB of free disk space
- a free hugging face account → [sign up here](https://huggingface.co/join)

---

## setup (do this once)

### 1. install the AI software

download **Stable Diffusion WebUI Forge** — this is the program that runs the AI:

- **windows:** [download the installer](https://github.com/lllyasviel/stable-diffusion-webui-forge/releases) and run `run.bat`
- **mac/linux:** open terminal, paste this and hit enter:
  ```
  git clone https://github.com/lllyasviel/stable-diffusion-webui-forge
  cd stable-diffusion-webui-forge
  ./webui.sh
  ```

let it run — it'll install everything it needs automatically. this takes a few minutes.

### 2. download the AI model

you need two files from hugging face. **log in first**, then accept the license on this page:
👉 [huggingface.co/black-forest-labs/FLUX.1-dev](https://huggingface.co/black-forest-labs/FLUX.1-dev)

download these two files:

| file | size | where to put it |
|------|------|-----------------|
| `flux1-dev.safetensors` | ~24 GB | `stable-diffusion-webui-forge/models/Stable-diffusion/` |
| `ae.safetensors` | ~335 MB | `stable-diffusion-webui-forge/models/VAE/` |

### 3. turn on the API

opensprite talks to forge through its API. you need to enable it:

**windows** — open `webui-user.bat` in notepad and find this line:
```
set COMMANDLINE_ARGS=
```
change it to:
```
set COMMANDLINE_ARGS=--api
```

**mac/linux** — open `webui-user.sh` in a text editor and find:
```
export COMMANDLINE_ARGS=""
```
change it to:
```
export COMMANDLINE_ARGS="--api"
```

### 4. start forge and load the model

1. run forge (`run.bat` on windows, `./webui.sh` on mac/linux)
2. open `http://localhost:7860` in your browser
3. click the **Stable Diffusion checkpoint** dropdown at the top
4. select `flux1-dev.safetensors`
5. wait ~30 seconds for it to load

forge needs to be running every time you use opensprite.

---

## using opensprite

1. open your terminal in this folder and run `./serve.sh`
2. go to `http://localhost:8080` in your browser
3. upload your character image
4. type the action you want (e.g. `walking`, `jumping`, `running`)
5. click **generate spritesheet** and wait (30–60 seconds per batch)
6. download as a spritesheet or individual frames zip

---

## something went wrong?

- **"connection refused" error** → forge isn't running, or you forgot `--api`
- **black images / no output** → make sure the flux model is selected in forge
- **very slow** → normal without a GPU, or with a weak one. flux is a big model.
- **out of memory** → add `--lowvram` to your launch flags alongside `--api`
