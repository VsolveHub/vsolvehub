const React = require("react");

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const SafeAreaInsetsContext = React.createContext(initialMetrics.insets);
const SafeAreaFrameContext = React.createContext(initialMetrics.frame);
const SafeAreaCornerAdaptedInsetsContext = React.createContext(null);

const SafeAreaProvider = ({ children, initialMetrics: metrics }) => {
  return React.createElement(
    SafeAreaFrameContext.Provider,
    { value: metrics?.frame ?? initialMetrics.frame },
    React.createElement(
      SafeAreaInsetsContext.Provider,
      { value: metrics?.insets ?? initialMetrics.insets },
      children
    )
  );
};

const SafeAreaConsumer = ({ children }) => {
  return children(initialMetrics.insets);
};

const SafeAreaView = ({ children, style, ...props }) => {
  return React.createElement("View", { style, ...props }, children);
};

const useSafeAreaInsets = () => {
  return React.useContext(SafeAreaInsetsContext) ?? initialMetrics.insets;
};

const useSafeAreaFrame = () => {
  return React.useContext(SafeAreaFrameContext) ?? initialMetrics.frame;
};

const withSafeAreaInsets = (WrappedComponent) => {
  return (props) => React.createElement(WrappedComponent, { ...props, insets: initialMetrics.insets });
};

module.exports = {
  __esModule: true,
  initialWindowMetrics: initialMetrics,
  SafeAreaInsetsContext,
  SafeAreaFrameContext,
  SafeAreaCornerAdaptedInsetsContext,
  SafeAreaProvider,
  SafeAreaConsumer,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  withSafeAreaInsets,
  default: {
    initialWindowMetrics: initialMetrics,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    SafeAreaCornerAdaptedInsetsContext,
    SafeAreaProvider,
    SafeAreaConsumer,
    SafeAreaView,
    useSafeAreaInsets,
    useSafeAreaFrame,
    withSafeAreaInsets,
  },
};
