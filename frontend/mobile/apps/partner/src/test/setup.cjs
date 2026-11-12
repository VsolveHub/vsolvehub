const actual = jest.requireActual("react-native-safe-area-context");
const mock = require("react-native-safe-area-context/jest/mock");
const safeAreaMock = mock.default || mock;

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  ...actual,
  ...safeAreaMock,
  default: safeAreaMock,
}));
