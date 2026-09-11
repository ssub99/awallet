import type { ParamListBase, StackNavigationState } from "expo-router/react-navigation";
import {
  createStackNavigator,
  type StackNavigationEventMap,
  type StackNavigationOptions,
} from "expo-router/js-stack";
import { withLayoutContext } from 'expo-router';

const { Navigator } = createStackNavigator();

export const AndroidJsStack = withLayoutContext<
  StackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  StackNavigationEventMap
>(Navigator);
