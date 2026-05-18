import { executeRequest } from '@/features/presentation/networking';
import { BRANDS_ENDPOINT } from '../../constants';

export async function deleteBrand(input: { readonly id: string }): Promise<void> {
  try {
    await executeRequest<unknown>({
      path: `${BRANDS_ENDPOINT}/${input.id}`,
      method: 'DELETE',
    });
  } catch (error) {
    // executeRequest unconditionally calls response.json() on a 2xx response.
    // DELETE returns 204 No Content with an empty body — fetch.json() throws a
    // SyntaxError for that body. A RequestError carries `status`; re-throw
    // only when status is present. Otherwise the empty-body parse error
    // signals success and we resolve.
    if ((error as { status?: number })?.status !== undefined) {
      throw error;
    }
  }
}
