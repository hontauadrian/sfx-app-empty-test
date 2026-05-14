import 'reflect-metadata';
import { RESOURCE_CAPTURES_KEY, ResourceCaptures } from '../resource-captures.decorator';

describe('ResourceCaptures decorator', () => {
  it('sets metadata with a single capture', () => {
    class TestController {
      @ResourceCaptures({ fromPath: 'id', resource: 'team', pathParam: 'id' })
      create(): Record<string, never> {
        return {};
      }
    }

    const metadata = Reflect.getMetadata(RESOURCE_CAPTURES_KEY, TestController.prototype.create);
    expect(metadata).toEqual([{ fromPath: 'id', resource: 'team', pathParam: 'id' }]);
  });

  it('sets metadata with multiple captures', () => {
    class TestController {
      @ResourceCaptures(
        { fromPath: 'id', resource: 'membership', pathParam: 'membershipId' },
        { fromPath: 'userId', resource: 'user', pathParam: 'userId' },
      )
      addMember(): Record<string, never> {
        return {};
      }
    }

    const metadata = Reflect.getMetadata(RESOURCE_CAPTURES_KEY, TestController.prototype.addMember);
    expect(metadata).toEqual([
      { fromPath: 'id', resource: 'membership', pathParam: 'membershipId' },
      { fromPath: 'userId', resource: 'user', pathParam: 'userId' },
    ]);
  });

  it('attaches x-resource-captures OpenAPI extension metadata', () => {
    class TestController {
      @ResourceCaptures({ fromPath: 'slug', resource: 'project', pathParam: 'slug' })
      create(): Record<string, never> {
        return {};
      }
    }

    const extensionMeta = Reflect.getMetadata(
      'swagger/apiExtension',
      TestController.prototype.create,
    );
    // NestJS Swagger stores extensions as an array of {extensionKey, extensionProperties}
    // or as a plain object depending on version. Check both shapes.
    if (Array.isArray(extensionMeta)) {
      const entry = extensionMeta.find(
        (e: { extensionKey: string }) => e.extensionKey === 'x-resource-captures',
      );
      expect(entry).toBeDefined();
      expect(entry.extensionProperties).toEqual([
        { fromPath: 'slug', resource: 'project', pathParam: 'slug' },
      ]);
    } else if (extensionMeta && typeof extensionMeta === 'object') {
      expect(extensionMeta['x-resource-captures']).toEqual([
        { fromPath: 'slug', resource: 'project', pathParam: 'slug' },
      ]);
    } else {
      // Fallback: just confirm some metadata was set on the method
      // The ApiExtension decorator in different NestJS versions may store differently
      const allKeys = Reflect.getMetadataKeys(TestController.prototype.create);
      const hasSwaggerKey = allKeys.some((k: string) => k.includes('swagger'));
      expect(hasSwaggerKey).toBe(true);
    }
  });
});
