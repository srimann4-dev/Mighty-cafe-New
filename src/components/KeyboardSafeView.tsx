import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

interface KeyboardSafeViewProps extends PropsWithChildren {
  /** Extra offset for headers / tab bars. Default 0. */
  offset?: number;
  /** Scroll content style overrides. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Outer wrap style. */
  style?: StyleProp<ViewStyle>;
  /** Disable ScrollView when parent already scrolls. */
  scroll?: boolean;
}

/**
 * Keeps focused inputs above the soft keyboard on iOS and Android.
 * Prefer this wrapper for forms and modal sheets that contain TextInputs.
 */
export function KeyboardSafeView({
  children,
  offset = 0,
  contentContainerStyle,
  style,
  scroll = true,
}: KeyboardSafeViewProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 24 },
});
