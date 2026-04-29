# EngageAI React Native SDK

Add an AI-powered voice and text assistant to any React Native or Expo app. Users speak or type what they want — EngageAI calls your app's functions to make it happen.

> **What you build with this:** A "Hey, transfer $50 to John" or "Show me restaurants near me" voice/text assistant inside your existing React Native app, without building any AI infrastructure yourself.

## Install

```bash
npm install github:engageai-hq/react-native-sdk \
  expo-av \
  expo-file-system \
  rive-react-native
```

> **Pin to a release:** `npm install github:engageai-hq/react-native-sdk#v0.1.0` for production apps.

## Important: Expo Go limitation

`rive-react-native` requires a **development build** — it won't work in Expo Go. Two options:

1. **Build a dev APK** (recommended for production):
   ```bash
   eas build --profile development --platform android
   ```

2. **Skip Rive for testing** — omit the `Rive` prop on `EngageVoiceChatModal` to use a text-only placeholder. Works in Expo Go.

## Quick start

```tsx
import { EngageAI, EngageVoiceChatModal } from '@engageai/react-native-sdk';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import Rive from 'rive-react-native';
import { useEffect, useState } from 'react';
import { Button, SafeAreaView } from 'react-native';

const engageAI = new EngageAI({
  serverUrl: 'https://engageai-sdk-production.up.railway.app',
  appId: 'your_app_id',          // from dashboard.engageai.tech
  apiKey: 'eai_...',             // from your portal's API Keys page
  appName: 'YourApp',
});

engageAI.registerFunction({
  name: 'get_balance',
  description: 'Get the current account balance',
  parameters: { type: 'object', properties: {} },
  handler: async () => ({ balance: 5000, currency: 'NGN' }),
});

export default function App() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    engageAI.initialize().then(() => setReady(true));
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      {ready && <Button title="Open AI Assistant" onPress={() => setOpen(true)} />}
      <EngageVoiceChatModal
        visible={open}
        onClose={() => setOpen(false)}
        engageAI={engageAI}
        Audio={Audio}
        FileSystem={FileSystem}
        Rive={Rive}                       // omit for text-only mode
        primaryColor="#1D4ED8"
      />
    </SafeAreaView>
  );
}
```

## Documentation

Full developer docs (configuration, function patterns, voices, confirmation flows, troubleshooting): **https://dashboard.engageai.tech/docs**

## Get an API key

1. Sign up at https://dashboard.engageai.tech
2. Create an app
3. Generate an API key
4. Define your functions (in code via `registerFunction(...)`, or visually in the portal)

The free tier includes 500 credits per month — enough to integrate, test, and ship to a small beta.

## What's in this repo

This is a published mirror of the React Native SDK source. Active development happens in the EngageAI monorepo; this repo is updated from there at each release.

```
src/
├── index.ts                 # public exports
├── core/EngageAI.ts         # main class
├── models/                  # type definitions
├── services/                # API client, audio service
├── hooks/                   # useEngageAI, useVoiceChat
└── components/              # EngageCharacterFab, EngageVoiceChatModal
```

## TypeScript

The package ships TypeScript source (no compiled `dist/`). This works correctly with Metro bundler in modern React Native projects (0.73+). If you need a compiled version, run `npm run build` in your local copy.

## Versioning

We use [SemVer](https://semver.org). Pin to a specific tag (`#v0.1.0`) for production apps; track `main` only if you're comfortable with breaking changes.

Current version: `0.1.0` (early — interfaces may change before 1.0).

## License

MIT — see [LICENSE](./LICENSE).

## Support

- Issues: https://github.com/engageai-hq/react-native-sdk/issues
- Email: help@engageai.tech
