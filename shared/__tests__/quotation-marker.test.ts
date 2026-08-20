import { fireEvent, render, screen } from '@testing-library/svelte';
import QuotationMarker from '../components/QuotationMarker.svelte';
import type { Quotation } from '../lib/data';

const fixture: Quotation = {
  column: '1000b',
  lo: 6,
  hi: 9,
  cite: 'Empedocles fr. 109 DK',
  author: 'Empedocles',
  url: 'https://www.perseus.tufts.edu/hopper/text?doc=Perseus:abo:tlg,1342,004:109',
  attestation: 'DK',
};

describe('QuotationMarker', () => {
  it('renders a real template anchor with target, rel, and the row href', async () => {
    render(QuotationMarker, { props: { quotation: fixture } });
    await fireEvent.click(screen.getByRole('button', { name: 'Quotation: Empedocles fr. 109 DK' }));
    const link = await screen.findByRole('link', { name: 'Empedocles fr. 109 DK' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveAttribute('href', fixture.url);
  });
});
