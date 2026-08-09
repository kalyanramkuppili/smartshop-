import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { getRatingColor } from '../utils/helpers';

interface RatingCircleProps {
  rating: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const sizeConfig = {
  small: { diameter: 40, strokeWidth: 3, fontSize: 12 },
  medium: { diameter: 60, strokeWidth: 4, fontSize: 16 },
  large: { diameter: 100, strokeWidth: 6, fontSize: 28 },
};

export const RatingCircle: React.FC<RatingCircleProps> = ({
  rating,
  size = 'small',
  showLabel = false,
}) => {
  const config = sizeConfig[size];
  const radius = (config.diameter - config.strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = useSharedValue(0);
  const ratingColor = getRatingColor(rating);

  React.useEffect(() => {
    progress.value = withTiming(rating / 5, {
      duration: 1000,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [rating]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View className="items-center">
      <View
        style={{ width: config.diameter, height: config.diameter }}
        className="items-center justify-center"
      >
        <Svg
          width={config.diameter}
          height={config.diameter}
          style={{ transform: [{ rotate: '-90deg' }] }}
        >
          {/* Background circle */}
          <Circle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={config.strokeWidth}
            fill="transparent"
          />
          {/* Progress circle */}
          <AnimatedCircle
            cx={config.diameter / 2}
            cy={config.diameter / 2}
            r={radius}
            stroke={ratingColor}
            strokeWidth={config.strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </Svg>
        <View className="absolute items-center justify-center">
          <Text
            className="text-white font-bold"
            style={{ fontSize: config.fontSize }}
          >
            {rating.toFixed(1)}
          </Text>
        </View>
      </View>
      {showLabel && (
        <Text className="text-white/60 text-xs mt-1">out of 5</Text>
      )}
    </View>
  );
};

export default RatingCircle;
