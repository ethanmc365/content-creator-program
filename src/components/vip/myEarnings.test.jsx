import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VipMyEarnings } from './myEarnings'

const state = vi.hoisted(() => ({ data: null, reload: vi.fn(), read: vi.fn() }))
vi.mock('../../lib/vip', () => ({
  useKindT: () => (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]),
  useOptionalRpc: (...args) => { state.read(...args); return { data: state.data, reload: state.reload } },
  money: (n) => `€${Number(n).toFixed(2)}`, monthLabel: (y, m) => `${y}-${m}`, perK: (n) => String(n),
}))
vi.mock('../network/Motion', () => ({ CountUp: ({ value, format }) => format(value), VIP_COUNT_MS: 0 }))
vi.mock('motion/react', () => ({ useReducedMotion: () => true }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>, Bar: ({ children, dataKey }) => <div data-testid="chart-series" data-key={dataKey}>{children}</div>,
  Cell: ({ fill, stroke }) => <span data-testid="bar" data-fill={fill} data-stroke={stroke} />,
  CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}))
afterEach(cleanup)
beforeEach(() => {
  state.data = { currency: 'EUR', balance: 7.97, history_credit: 7.97, cash_threshold: 100, rows: [
    { year: 2026, month: 8, views: 14343, pay: 2.87, source: 'sheet' },
    { year: 2026, month: 9, views: 25447, pay: 5.10, source: 'sheet' },
    { year: 2026, month: 10, views: 20000, pay: 4, source: 'platform', live: true },
  ] }
})
describe('VIP earnings and wallet distinction', () => {
  it('does not add the imported credit to lifetime earnings again, and separates the live month', () => {
    const open = vi.fn()
    render(<VipMyEarnings onWallet={open} />)
    expect(screen.getByText('€11.97')).toBeTruthy()
    expect(screen.getByText('Available balance')).toBeTruthy()
    expect(screen.getByText('This month so far')).toBeTruthy()
    expect(screen.getByText('This month is still counting')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /View payouts/ }))
    expect(open).toHaveBeenCalledOnce()
  })
  it('switches the chart series and keeps every month fully coloured', () => {
    render(<VipMyEarnings />)
    expect(screen.getAllByTestId('bar').map((b) => b.dataset.fill)).toEqual(['url(#tg-brand)', 'url(#tg-brand)', 'url(#tg-brand)'])
    expect(screen.getByTestId('chart-series').dataset.key).toBe('paid')
    fireEvent.click(screen.getByRole('button', { name: 'Views' }))
    expect(screen.getByTestId('chart-series').dataset.key).toBe('views')
    const august = screen.getByRole('button', { name: /2026-8/ })
    fireEvent.click(august)
    expect(august.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getAllByTestId('bar')[0].dataset.stroke).toBe('#1A1A1A')
  })
  it('shows zero available after withdrawal while retaining the original credit provenance', () => {
    state.data.balance = 0
    render(<VipMyEarnings walletVersion={1} />)
    expect(screen.getByText('€0.00')).toBeTruthy()
    expect(screen.getByText('€11.97')).toBeTruthy()
    expect(state.read).toHaveBeenLastCalledWith('vip_my_earnings', {}, 'my-earnings:1')
  })
  it('shows a retry for a failed read, not a false empty earnings state', () => {
    state.data = null
    render(<VipMyEarnings />)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(state.reload).toHaveBeenCalled()
  })
  it('still shows a positive wallet when there are no monthly earnings rows', () => {
    state.data.rows = []
    render(<VipMyEarnings />)
    expect(screen.getByText('Available balance')).toBeTruthy()
    expect(screen.queryByText('Your earnings will show here')).toBeNull()
  })
})
