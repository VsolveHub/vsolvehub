// react-native-maps is a native view; tests render its parts as plain host views.
const React = require("react");
const { View } = require("react-native");

function host(name) {
  const Component = React.forwardRef(function MapPart(props, ref) {
    React.useImperativeHandle(ref, () => ({ fitToCoordinates() {} }));
    return React.createElement(View, { ...props, testID: props.testID ?? name }, props.children);
  });
  Component.displayName = name;
  return Component;
}

const MapView = host("MapView");
module.exports = {
  __esModule: true,
  default: MapView,
  Marker: host("Marker"),
  Polyline: host("Polyline"),
  Circle: host("Circle"),
  PROVIDER_DEFAULT: undefined,
  PROVIDER_GOOGLE: "google",
};
