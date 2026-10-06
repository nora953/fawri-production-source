export function cashierStationCreationBody(input: {
  name: string;
  locationId: string;
  locations: readonly { id: string }[];
  locationsLoaded: boolean;
  offlineAuthority: boolean;
}) {
  const name = input.name.trim();
  if (!input.locationsLoaded || !name) return null;
  if (input.locations.length > 0 && !input.locations.some(location => location.id === input.locationId)) return null;
  return {
    name,
    ...(input.locations.length === 0 ? { branch_key: 'main' } : { location_id: input.locationId }),
    offline_inventory_authority: input.offlineAuthority,
  };
}
