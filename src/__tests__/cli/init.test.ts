import { describe, test, expect } from 'vitest';
import { TEMPLATE_FILES } from '../../cli/commands/init.js';

describe('TEMPLATE_FILES', () => {
  test('contains all required file paths', () => {
    const paths = Object.keys(TEMPLATE_FILES);
    expect(paths).toContain('.gitignore');
    expect(paths).toContain('Makefile');
    expect(paths).toContain('agents/hotel_search.agent.abl');
    expect(paths).toContain('agents/hotel_booking.agent.abl');
    expect(paths).toContain('agents/hotel.supervisor.abl');
    expect(paths).toContain('tools/hotels-api.tools.abl');
  });

  test('hotel_search agent declares correct AGENT name and VERSION', () => {
    const content = TEMPLATE_FILES['agents/hotel_search.agent.abl'];
    expect(content).toMatch(/^AGENT: hotel_search/m);
    expect(content).toMatch(/^VERSION: "1\.0\.0"/m);
  });

  test('hotel_booking agent declares correct AGENT name and includes book_hotel', () => {
    const content = TEMPLATE_FILES['agents/hotel_booking.agent.abl'];
    expect(content).toMatch(/^AGENT: hotel_booking/m);
    expect(content).toContain('book_hotel');
  });

  test('hotel supervisor declares SUPERVISOR and references both agents', () => {
    const content = TEMPLATE_FILES['agents/hotel.supervisor.abl'];
    expect(content).toMatch(/^SUPERVISOR: hotel_coordinator/m);
    expect(content).toContain('hotel_search');
    expect(content).toContain('hotel_booking');
    expect(content).toContain('./hotel_search.agent.abl');
    expect(content).toContain('./hotel_booking.agent.abl');
  });

  test('tools file declares all 4 HTTP tools', () => {
    const content = TEMPLATE_FILES['tools/hotels-api.tools.abl'];
    expect(content).toContain('search_hotels');
    expect(content).toContain('get_hotel');
    expect(content).toContain('check_availability');
    expect(content).toContain('book_hotel');
  });

  test('Makefile uses auto-discovery patterns', () => {
    const content = TEMPLATE_FILES['Makefile'];
    expect(content).toContain('wildcard agents/*.agent.abl');
    expect(content).toContain('wildcard agents/*.supervisor.abl');
    expect(content).toContain('deploy-staging');
    expect(content).toContain('import-abl');
  });
});
