function getReadonlyPropertyDescriptors<T, P>(properties: { [P in keyof T]?: T[P] }) {
    const propertyDescriptorMap: PropertyDescriptorMap = {};
    for (const [property, propertyDescriptor] of Object.entries(Object.getOwnPropertyDescriptors(properties))) {
        if (typeof propertyDescriptor?.get === 'function' || typeof propertyDescriptor?.set === 'function') {
            propertyDescriptorMap[property] = {...propertyDescriptor, configurable: false};
            continue;
        }
        propertyDescriptorMap[property] = {
            ...propertyDescriptor, writable: false, configurable: false
        };
    }
    return propertyDescriptorMap;
}

export function createWithReadonlyProperties<T>(p: object | null, properties: { [P in keyof T]?: T[P] }) {
    return Object.create(p, getReadonlyPropertyDescriptors(properties));
}

export function assignReadonlyProperties<T>(
    o: T, properties: { [P in keyof T]?: T[P] }
) {
    return Object.defineProperties(o, getReadonlyPropertyDescriptors(properties));
}

export function makePropertiesReadonly<T>(
    o: T, ...properties: (keyof T)[]
) {
    const propertyDescriptorMap: PropertyDescriptorMap = {};
    for (const property of properties) {
        const propertyDescriptor = Object.getOwnPropertyDescriptor(o, property);
        if (typeof propertyDescriptor?.get === 'function' || typeof propertyDescriptor?.set === 'function') {
            propertyDescriptorMap[property] = { ...propertyDescriptor, configurable: false };
            continue;
        }
        propertyDescriptorMap[property] = {
            ...propertyDescriptor, writable: false, configurable: false
        };
    }
    return Object.defineProperties(o, propertyDescriptorMap);
}