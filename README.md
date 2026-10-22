# Telepresença Robótica 3D

Aplicação web única com duas interfaces:

| Rota | Quem usa | O que mostra |
|---|---|---|
| `/robot` | Dispositivo diante da pessoa (tablet, monitor, notebook) | Somente o personagem 3D em tela cheia, balão da saudação e indicador de privacidade |
| `/operator` | Operador humano, em outro notebook | Vídeo ao vivo da pessoa, voz robótica, expressões, saudação, estado da conexão |

O personagem é **operado por uma pessoa** em tempo real. O sistema não contém nenhuma IA e não finge ter: há um botão “Revelar operador” para encerrar a demonstração com transparência.

---

## Arquitetura

```
 Operador (/operator)                                     Robô (/robot)
 ┌──────────────────────┐   HTTPS + WebSocket   ┌──────────────────┐   ┌──────────────────────┐
 │ mic → AudioWorklet   │ ────── sinalização ──►│ Servidor de      │◄──│ câmera + microfone   │
 │  (voz robótica)      │ ◄──── status/eventos ─│ sinalização Node │   │ personagem 3D        │
 │ vídeo da pessoa      │                       │ (Render/Railway) │   │ lip sync do áudio    │
 └──────────┬───────────┘                       └──────────────────┘   └──────────┬───────────┘
            │            WebRTC (áudio/vídeo P2P, ou via TURN quando necessário)  │
            └──────────────────────────────────────────────────────────────────────┘
   Frontend estático (Vite) hospedado na Vercel — serve as duas rotas.
```

* **Frontend (Vercel):** React + TypeScript + Vite + Tailwind + Three.js/React Three Fiber/Drei + Framer Motion.
* **Sinalização (fora da Vercel):** a Vercel não mantém conexões WebSocket persistentes em funções serverless, por isso o servidor `server/` (Node + `ws`) roda em um serviço com suporte a WebSocket (Render, Railway, Fly.io, VPS…). Ele também faz login do operador, cria sessões e entrega credenciais TURN temporárias.
* **Mídia:** nunca passa pelo servidor de sinalização nem por funções serverless. Vai direto entre os navegadores via WebRTC; se a rede impedir, usa um servidor **TURN** como retransmissão.

### Fluxo de uma sessão
1. Operador entra com a senha → servidor devolve um token de administrador.
2. “Criar sessão” → servidor gera `sessionId` + token do operador + token do robô (HMAC, expiram em 12 h).
3. O link `/robot?t=<token-do-robô>` (ou QR code) é aberto no dispositivo do personagem → “Toque para iniciar” libera áudio, câmera e microfone.
4. O operador cria a oferta WebRTC: áudio *sendrecv* (voz robótica → robô; ambiente → operador) e vídeo *recvonly* (câmera do robô → operador). O operador **nunca envia vídeo**.
5. Comandos (expressões, saudação, configuração) vão pelo WebSocket; o robô devolve seu **estado real** (aguardando/escutando/falando/saudando, câmera, microfone).
6. “Encerrar sessão” revoga a sessão no servidor: o link do robô deixa de funcionar e as mídias são liberadas nos dois lados.

---

## Estrutura do código

```
src/
  shared/protocol.ts            Contrato de mensagens entre operador, robô e servidor
  config/env.ts                 Variáveis públicas do frontend
  lib/api.ts                    Login, sessões e credenciais ICE
  lib/signaling/                Cliente WebSocket com reconexão exponencial e medição de RTT
  lib/webrtc/                   RTCPeerConnection: negociação, ICE restart, estatísticas reais
  lib/media/devices.ts          Captura de câmera/microfone e mensagens de erro
  lib/audio/
    RobotVoiceChain.ts          Cadeia de voz do operador (Web Audio)
    voicePresets.ts             Predefinições de voz
    LipSyncAnalyzer.ts          Visemas a partir do áudio reproduzido no robô
    TextVisemes.ts              Visemas a partir do texto (apenas para síntese do navegador)
  character/
    RobotStage.tsx              Canvas, câmera, iluminação, ambiente e níveis de qualidade
    parts/                      Rosto, olhos, boca, moldura, corpo e braço (geometria procedural)
    useRobotAnimation.ts        Loop único de animação (piscadas, olhar, respiração, aceno, boca)
    expressions.ts              11 expressões como parâmetros faciais contínuos
    CharacterController.ts      Estado-alvo do personagem e sequência de saudação
    FaceIcon.tsx                Ícones das expressões gerados dos mesmos parâmetros
  robot/                        Interface /robot e RobotSession (lógica do dispositivo)
  operator/                     Interface /operator, OperatorSession e componentes da central
public/worklets/robot-voice-processor.js   AudioWorklet do timbre robótico
server/                         Sinalização, autenticação, sessões e ICE/TURN (+ teste)
```

### Voz robótica (operador)
`mic → ganho → passa-altas → AudioWorklet [noise gate · pitch shift granular · modulação em anel · quantização] → 3 ressonâncias de formante → comb metálico com realimentação → passa-baixas → compressor → WebRTC`

Ajustáveis em tempo real na aba **Voz robótica**: intensidade, tom, formantes, timbre metálico, frequência e quantidade da modulação, textura digital, porta de ruído, supressão de ruído e volume. Latência adicional típica: ~15–30 ms.

### Sincronização labial (robô)
A voz recebida toca por um elemento `<audio>` (para o cancelamento de eco do navegador reconhecê-la) e **o mesmo stream** alimenta um analisador. A cada quadro são extraídos energia RMS (abertura), centróide espectral (vogais arredondadas O/U × alongadas E/I), energia acima de 4,5 kHz (sibilantes) e quedas bruscas (oclusivas P/B/M). A boca é uma malha paramétrica com lábios, dentes e língua; quando o áudio para, volta suavemente ao repouso.

### Saudação
Desperta → abre os olhos e olha para a câmera → inclina a cabeça → sorri → acena → fala → volta ao repouso. A fala pode ser:
* **Gravada com voz robótica** (recomendado): o operador grava na aba *Saudação*; o áudio passa pela mesma cadeia robótica e a boca é guiada pela análise do áudio.
* **Síntese do navegador** (padrão até gravar): voz pt-BR do sistema; a boca segue visemas do texto. *Limitação real:* a Web Speech API não permite processar esse áudio, então ele **não** recebe o efeito robótico.

### Anti-eco e microfonia
* Cancelamento de eco do navegador ativo nos dois lados.
* **Half-duplex** (ligado por padrão): o microfone do robô pausa enquanto o personagem fala.
* Retorno da própria voz para o operador fica desligado por padrão; recomenda-se fone de ouvido.

---

## Executar localmente (Windows — Prompt de Comando)

Requisitos: **Node.js 22 ou superior** e Chrome/Edge atualizados.

```bat
cd telepresenca-robotica
npm install
cd server
npm install
copy .env.example .env
cd ..
```

Edite `server\.env` e defina pelo menos `SESSION_SECRET` (32+ caracteres), `OPERATOR_PASSWORD` e `ALLOWED_ORIGINS=http://localhost:5173`. Para desenvolvimento, apague a linha `NODE_ENV=production`.

Terminal 1 — servidor de sinalização:
```bat
cd telepresenca-robotica\server
npm start
```

Terminal 2 — frontend:
```bat
cd telepresenca-robotica
copy .env.example .env
npm run dev
```

Abra `http://localhost:5173/operator`, entre com a senha, crie a sessão e use **“Abrir aqui”** na aba *Link do robô* para testar as duas interfaces na mesma máquina (use fones de ouvido).

Laboratório visual do personagem (somente em desenvolvimento): `http://localhost:5173/dev/stage` — permite testar expressões, saudação e enquadramento sem conexão.

Teste automatizado do servidor:
```bat
cd telepresenca-robotica\server
npm test
```

### Testar entre dois dispositivos
Câmera e microfone só funcionam em **HTTPS** (ou `localhost`). Duas opções:

1. **Recomendado:** publique (seção abaixo) e use as URLs da Vercel e do Render.
2. **Túnel temporário** com o Cloudflare Tunnel (`cloudflared`):
   ```bat
   cloudflared tunnel --url http://localhost:8787
   cloudflared tunnel --url http://localhost:5173
   ```
   Coloque a URL do túnel do servidor em `VITE_SIGNALING_URL` (arquivo `.env` da raiz), a URL do túnel do frontend em `ALLOWED_ORIGINS` (`server\.env`) e reinicie ambos.

Para redes diferentes (4G × Wi-Fi corporativo, por exemplo), configure um **TURN**; sem ele algumas conexões falham — a central avisa quando nenhum TURN está configurado e mostra se a mídia está “P2P direto” ou “via TURN”.

---

## Publicação

### 1. Servidor de sinalização (Render — plano gratuito funciona para testes)
1. Envie o projeto para um repositório no GitHub.
2. No Render: **New → Blueprint** e selecione o repositório (o arquivo `render.yaml` já descreve o serviço) — ou **New → Web Service** com *Root Directory* `server`, *Build* `npm install --omit=dev`, *Start* `node src/index.js`.
3. Variáveis de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SESSION_SECRET` | sim | Segredo aleatório (32+ caracteres) para assinar tokens |
| `OPERATOR_PASSWORD` | sim | Senha da central do operador |
| `ALLOWED_ORIGINS` | sim | URL do frontend, ex.: `https://seu-projeto.vercel.app` (várias separadas por vírgula) |
| `NODE_ENV` | sim | `production` |
| `METERED_DOMAIN` / `METERED_API_KEY` | recomendada | TURN gerenciado da Metered.ca |
| `TURN_URLS` + `TURN_STATIC_AUTH_SECRET` | alternativa | coturn próprio com credenciais temporárias |
| `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` | alternativa | qualquer TURN com credenciais fixas |
| `STUN_URLS` | não | Substitui os STUN padrão do Google |
| `SESSION_TTL_HOURS` | não | Validade das sessões (padrão 12) |

> No plano gratuito do Render o serviço “dorme” após inatividade; o primeiro acesso pode levar ~1 minuto. Para demonstrações, use um plano pago ou abra a URL `/health` antes.

Também há um `server/Dockerfile` para Railway, Fly.io ou qualquer VPS.

### 2. TURN (Metered.ca)
1. Crie uma conta em metered.ca → **TURN Server** → crie um app.
2. Copie o domínio (`seuapp.metered.live`) e a **API Key**.
3. Defina `METERED_DOMAIN` e `METERED_API_KEY` no servidor de sinalização. A chave nunca chega ao navegador: o servidor busca as credenciais e as repassa apenas a clientes com token de sessão válido.

### 3. Frontend (Vercel)
1. **Add New → Project** e importe o repositório (raiz do projeto; o `vercel.json` já define build, saída e reescritas das rotas).
2. Variável de ambiente: `VITE_SIGNALING_URL=https://seu-servidor.onrender.com`.
3. Faça o deploy e adicione a URL final da Vercel em `ALLOWED_ORIGINS` no servidor.

Ou pela linha de comando:
```bat
npm install -g vercel
vercel --prod
```

---

## Usando na demonstração
1. No notebook do operador: `/operator` → senha → **Criar sessão** → **Iniciar sessão** (permita o microfone).
2. No dispositivo do robô: leia o QR code ou abra o link → **Toque para iniciar** (permita câmera e microfone). A tela entra em tela cheia; toque duas vezes para alternar.
3. O personagem desperta e faz a saudação automaticamente (configurável).
4. Conduza a interação falando e escolhendo expressões. “Automático” alterna entre falando/escutando/repouso com base no áudio real.
5. Ao final, **Revelar operador** exibe no robô que o personagem foi conduzido por uma pessoa. **Encerrar sessão** invalida o link.

Parâmetro opcional para dispositivos modestos: `/robot?q=low` (ou `medium`). A qualidade também é reduzida automaticamente se a taxa de quadros cair.

---

## Segurança e privacidade
* A central exige senha; o servidor aplica limite de tentativas de login.
* Cada sessão tem tokens separados por papel: o token do robô não permite controlar o personagem nem ver vídeo; somente o operador envia comandos.
* Um único dispositivo por papel e sessão; tokens expiram e são revogados ao encerrar.
* `ALLOWED_ORIGINS` restringe quais sites podem usar o servidor.
* Segredos (senha, TURN, assinatura) existem apenas no servidor.
* O robô exibe permanentemente o indicador “Câmera e microfone em uso” e o LED da câmera virtual acende quando a câmera está ativa. A tela inicial informa que câmera e microfone serão compartilhados.
* O vídeo da pessoa é exibido **somente** na central; a rota `/robot` nunca o renderiza.

## Compatibilidade
Testado no Chromium (Chrome/Edge). Firefox e Safari recentes suportam WebRTC e AudioWorklet; no iPhone/iPad não existe tela cheia por API (use “Adicionar à Tela de Início”) e a escolha de saída de áudio não está disponível.

## Limitações conhecidas
* A saudação por síntese do navegador não recebe o efeito robótico (limitação da Web Speech API) — grave a saudação para ter a voz robotizada.
* A sincronização labial é estimada por características espectrais do áudio (não por reconhecimento de fonemas).
* Sessões ficam em memória no servidor: se ele reiniciar, os dispositivos reconectam sozinhos (os tokens continuam válidos), mas a configuração é reenviada pelo operador ao reconectar.
