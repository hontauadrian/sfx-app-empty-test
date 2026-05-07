---
name: mobile-patterns
description: Mobile-specific implementation patterns for React Native / Expo. Includes keyboard handling (react-native-keyboard-controller), styling with theme tokens, FlashList for lists, tenant system, accessibility, navigation, and error handling. Use when working on mobile screens, components, or mobile-specific features.
---

# Mobile Patterns

## App Structure

```
apps/mobile/
├── app/                        # Expo Router — THIN WRAPPERS ONLY
│   ├── _layout.tsx             # Root: ThemeProvider, QueryClientProvider, KeyboardProvider
│   ├── index.tsx               # Splash → auth or tabs redirect
│   ├── RootLayout.tsx          # Stack navigator
│   ├── (auth)/
│   │   └── (authtabs)/         # Material top tabs (Login | Register)
│   └── (tabs)/
│       └── [tabName]/
├── features/                   # Feature modules — presentation layer only
│   ├── [feature]/
│   │   ├── pages/
│   │   │   └── [pageName]/     # See page-pattern skill for file structure
│   │   └── components/
│   ├── appConfig/              # Tenant config mapping
│   ├── designSystem/           # Shared UI, theme, responsiveness, tenants
│   └── networking/
├── assets/
│   ├── fonts/
│   └── images/[tenant]/
└── __tests__/
```

Thin wrapper:

```typescript
// app/(tabs)/shop/reward.tsx
import { RewardPage } from "@/features/shop/reward/pages/reward";
const Page: React.FC = () => <RewardPage />;
export default Page;
```

---

## Styling

`styles.ts` holds structural layout only — no design tokens. All dynamic values applied inline.

```typescript
import { StyleSheet } from "react-native";

// styles.ts — structural layout only
export const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center" },
});

// In component — tokens inline as second array item:
const { theme } = useTheme();
const { colors, spacing, fontSizes, borderRadius } = theme;

<View style={[styles.container, { backgroundColor: colors.background, padding: spacing.md }]} />
<Text style={{ color: colors.text, fontSize: fontSizes.md }} />
```

---

## Keyboard Handling — react-native-keyboard-controller

**ALL screens with text inputs MUST use `react-native-keyboard-controller`.** Never use `KeyboardAvoidingView` or `react-native-keyboard-aware-scroll-view`.

### Root layout — KeyboardProvider

```typescript
import { KeyboardProvider } from "react-native-keyboard-controller";

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {/* app content */}
        </QueryClientProvider>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
```

### Screen with form inputs

```typescript
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

export const LoginPage: React.FC = () => {
  return (
    <KeyboardAwareScrollView bottomOffset={20} style={styles.container}>
      <CustomInput value={uiModel.emailValue} onChangeText={(value) => handleInputChange("email", value)} />
      <CustomInput value={uiModel.passwordValue} onChangeText={(value) => handleInputChange("password", value)} />
    </KeyboardAwareScrollView>
  );
};
```

### List with text inputs — renderScrollComponent

```typescript
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { FlashList } from "@shopify/flash-list";

const RenderScrollComponent = React.forwardRef<ScrollView, ScrollViewProps>(
  (props, ref) => <KeyboardAwareScrollView {...props} ref={ref} />,
);

<FlashList
  renderScrollComponent={RenderScrollComponent}
  data={items}
  renderItem={renderItem}
  estimatedItemSize={80}
/>
```

Additional components:
- `KeyboardStickyView` — elements that stick above the keyboard (submit buttons, toolbars)
- `KeyboardToolbar` — "Previous / Next / Done" navigation across inputs
- `bottomOffset` prop — controls spacing between keyboard and focused input

---

## Navigation — Expo Router

```
app/
├── _layout.tsx       # Providers
├── RootLayout.tsx    # Store init, fonts, Stack
├── index.tsx         # Auth redirect
├── (tabs)/           # Tab navigator
└── (auth)/
    ├── intro.tsx, start.tsx, resetPassword.tsx
    └── (authtabs)/   # Login, Register
```

Auth redirects:
- No token + no seenIntro → `/(auth)/intro`
- No token → `/(auth)/start`
- `auth:loginRequired` event → `/(auth)/(authtabs)/`

Route params:

```typescript
import { useLocalSearchParams } from "expo-router";
const { id } = useLocalSearchParams() as { id: string };
```

---

## List Performance

- **FlashList** for datasets > 20 items. Always provide `estimatedItemSize`.
- Extract list items and wrap with `React.memo`.
- Use `FlatList` only for short, static lists.
- Never render large lists inside `ScrollView`.

---

## Image Assets

- Appropriately sized per density (`@2x`, `@3x`), prefer WebP.
- Access tenant images via `theme.assets.[KEY]`, never by direct path.

---

## Accessibility

- Every `TouchableOpacity`, `Pressable`, `TextInput` must have `accessibilityLabel` (from UIModel) and `accessibilityRole`
- Images: `accessibilityLabel` with descriptive string
- Decorative images: `accessibilityElementsHidden={true}`
- Form inputs: always pair with a visible label — never rely on placeholder alone

---

## Error Handling

- **Transient errors**: `Notifier` + `ErrorNotification` in the hook — never in the page
- **Persistent errors**: surface through UIModel (`uiModel.loginError`, `uiModel.showErrorBanner`)
- **Unrecoverable errors**: root layout error boundary

---

## Tenant / White-Label System

```
features/designSystem/tenants/[tenantName]/
├── Colors.ts       # { light: Colors, dark: Colors }
├── Fonts.ts        # FONT_NAMES map + require() for font files
├── TextStyles.ts   # Typography presets using scaleFont() and scale()
└── Assets.ts       # Images, icons, Lottie animations
```

- Never hardcode tenant values outside `tenants/` — go through `useTheme()` or `CONFIG`
- `Colors.ts` exports both `light` and `dark` variants
- Assets accessed via `theme.assets.[KEY]` (see Image Assets above)

### Adding a new tenant

1. Create `features/designSystem/tenants/[newTenant]/` with all 4 files
2. Add font files to `assets/fonts/` and images to `assets/images/[newTenant]/`
3. Add tenant entry in `features/appConfig/index.ts`
4. Set `TENANT` in Expo config
