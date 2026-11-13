import { fireEvent, screen } from 'expo-router/testing-library'; // first: sets up the native-module stand-ins
import { render } from '@testing-library/react-native';

import { Field } from '@/components/ui';

test('shows and hides the password', async () => {
  await render(<Field label="Password" value="secret1" onChangeText={() => undefined} secureTextEntry />);
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
});

test('a normal field has no show button', async () => {
  await render(<Field label="Email" value="" onChangeText={() => undefined} />);
  expect(screen.queryByRole('button', { name: 'Show password' })).toBeNull();
});
