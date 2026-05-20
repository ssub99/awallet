import type { ParamListBase, StackNavigationState } from '@react-navigation/native';
import {
  createStackNavigator,
  type StackNavigationEventMap,
  type StackNavigationOptions,
} from '@react-navigation/stack';
import { withLayoutContext } from 'expo-router';

const { Navigator } = createStackNavigator();

export const AndroidJsStack = withLayoutContext<
  StackNavigationOptions,
  typeof Navigator,
  StackNavigationState<ParamListBase>,
  StackNavigationEventMap
>(Navigator);
