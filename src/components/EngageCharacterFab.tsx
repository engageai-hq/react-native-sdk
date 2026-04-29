import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

// Rive is a peer dep — imported as a type to stay optional-friendly
import type RiveModule from 'rive-react-native';

export type CharacterState = 'idle' | 'listening' | 'thinking' | 'talking' | 'celebrating' | 'error';

export interface EngageCharacterFabProps {
  /** Called when the button is tapped */
  onPress: () => void;
  /** Character state drives the Rive animation */
  characterState?: CharacterState;
  /** URL of the .riv file (served from EngageAI backend) */
  characterUrl?: string | null;
  /** API key to authenticate the .riv download */
  apiKey?: string;
  /** Accent colour for the FAB ring */
  primaryColor?: string;
  /** Size of the circular button (default: 72) */
  size?: number;
  /** Optional extra style for the container */
  style?: ViewStyle;
  /** Pass `Rive` from `import Rive from 'rive-react-native'`. Omit to show a plain coloured button. */
  Rive?: typeof RiveModule;
}

/**
 * Floating action button that shows the EngageAI animated character.
 *
 * ```tsx
 * import Rive from 'rive-react-native';
 * <EngageCharacterFab Rive={Rive} onPress={() => setModalOpen(true)} characterUrl={engageAI.characterUrl} apiKey={config.apiKey} />
 * ```
 */
export function EngageCharacterFab({
  onPress,
  characterState = 'idle',
  characterUrl,
  apiKey,
  primaryColor = '#00C07F',
  size = 72,
  style,
  Rive,
}: EngageCharacterFabProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [riveHeaders, setRiveHeaders] = useState<Record<string, string>>({});

  // Pulse ring while listening
  useEffect(() => {
    if (characterState === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [characterState]);

  // Build auth headers for Rive network load
  useEffect(() => {
    if (apiKey) setRiveHeaders({ 'X-EngageAI-Key': apiKey });
  }, [apiKey]);

  const riveStateMachine = 'State Machine 1';
  const riveInput = stateMachineInputForState(characterState);

  return (
    <Animated.View
      style={[
        styles.outerRing,
        {
          width: size + 12,
          height: size + 12,
          borderRadius: (size + 12) / 2,
          borderColor: primaryColor,
          transform: [{ scale: pulseAnim }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={[
          styles.fab,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: primaryColor,
          },
        ]}
      >
        <View style={styles.riveContainer}>
          {Rive && characterUrl ? (
            <Rive
              url={characterUrl}
              stateMachineName={riveStateMachine}
              style={styles.rive}
            />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: `${primaryColor}33` }]} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function stateMachineInputForState(state: CharacterState): string {
  switch (state) {
    case 'listening': return 'isListening';
    case 'thinking': return 'isThinking';
    case 'talking': return 'isTalking';
    case 'celebrating': return 'isCelebrating';
    case 'error': return 'isError';
    default: return 'isIdle';
  }
}

const styles = StyleSheet.create({
  outerRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.95,
  },
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  riveContainer: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  rive: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    borderRadius: 999,
  },
});
