import assert from 'node:assert/strict';
import test from 'node:test';
import { cashierStationCreationBody } from '../src/lib/cashierStationCreation';

const input = { name: ' First station ', locationId: '', locations: [], locationsLoaded: true, offlineAuthority: false };
test('first station uses server-authoritative main location bootstrap', () => {
  assert.deepEqual(cashierStationCreationBody(input), {name:'First station',branch_key:'main',offline_inventory_authority:false});
});
test('unloaded location state cannot bootstrap a location', () => {
  assert.equal(cashierStationCreationBody({...input,locationsLoaded:false}),null);
  assert.equal(cashierStationCreationBody({...input,name:' '}),null);
});
test('existing locations require a known explicit selection', () => {
  const existing = {...input,locations:[{id:'location-a'}]};
  assert.equal(cashierStationCreationBody(existing),null);
  assert.equal(cashierStationCreationBody({...existing,locationId:'another-merchant-location'}),null);
  assert.deepEqual(cashierStationCreationBody({...existing,locationId:'location-a'}),{name:'First station',location_id:'location-a',offline_inventory_authority:false});
});
