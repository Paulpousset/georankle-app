import { render, screen } from '@testing-library/react-native';

import { TruncatedText } from '../TruncatedText';

describe('TruncatedText', () => {
  it('renders its children', () => {
    render(<TruncatedText>Jean-Christophe de la Tour</TruncatedText>);
    expect(screen.getByText('Jean-Christophe de la Tour')).toBeTruthy();
  });

  it('truncates to a single tail-ellipsized line by default', () => {
    render(<TruncatedText>some long username</TruncatedText>);
    const node = screen.getByText('some long username');
    expect(node.props.numberOfLines).toBe(1);
    expect(node.props.ellipsizeMode).toBe('tail');
  });

  it('lets callers override the line count', () => {
    render(<TruncatedText numberOfLines={2}>two line label</TruncatedText>);
    expect(screen.getByText('two line label').props.numberOfLines).toBe(2);
  });
});
