import assert from 'node:assert/strict';
import test from 'node:test';
import { cashierStationCreationBody } from '../src/lib/cashierStationCreation';

const empty = {
  name: ' First station ',
  locationId: '',
  locations: [],
  locationsLoaded: true,
  offlineAuthority: false,
};

test('first station delegates the initial main location bootstrap to the server', () => {
  assert.deepEqual(cashierStationCreationBody(empty), {
    name: 'First station',
    branch_key: 'main',
    offline_inventory_authority: false,
  });
});

test('failed or incomplete location loading cannot bootstrap a location', () => {
  assert.equal(cashierStationCreationBody({ ...empty, locationsLoaded: false }), null);
  assert.equal(cashierStationCreationBody({ ...empty, name: ' ' }), null);
});

test('existing locations require a recognized explicit selection', () => {
  const existing = { ...empty, locations: [{ id: 'location-a' }] };
  assert.equal(cashierStationCreationBody(existing), null);
  assert.equal(
    cashierStationCreationBody({ ...existing, locationId: 'unknown-location' }),
    null,
  );
  assert.deepEqual(
    cashierStationCreationBody({ ...existing, locationId: 'location-a', offlineAuthority: true }),
    {
      name: 'First station',
      location_id: 'location-a',
      offline_inventory_authority: true,
    },
  );
});
