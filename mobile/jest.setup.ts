import { configure } from '@testing-library/react-native';

// First test in a cold run includes Babel transform time; the 1 s default made it flaky.
configure({ asyncUtilTimeout: 5000 });
