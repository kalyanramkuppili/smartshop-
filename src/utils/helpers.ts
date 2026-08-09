export const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
};

export const getRatingColor = (rating: number): string => {
  if (rating >= 4.5) return '#22c55e';
  if (rating >= 4.0) return '#84cc16';
  if (rating >= 3.5) return '#f59e0b';
  return '#ef4444';
};

export const getStoreColor = (storeName: string): { bg: string; text: string } => {
  const colors: Record<string, { bg: string; text: string }> = {
    Amazon: { bg: '#FF9900', text: '#000000' },
    Flipkart: { bg: '#2874F0', text: '#FFFFFF' },
    'Apple Store': { bg: '#555555', text: '#FFFFFF' },
    'Samsung Store': { bg: '#1428A0', text: '#FFFFFF' },
    'OnePlus Store': { bg: '#EB0028', text: '#FFFFFF' },
    'Sony Store': { bg: '#000000', text: '#FFFFFF' },
    'Nothing Store': { bg: '#000000', text: '#FFFFFF' },
  };
  return colors[storeName] || { bg: '#6366f1', text: '#FFFFFF' };
};

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
