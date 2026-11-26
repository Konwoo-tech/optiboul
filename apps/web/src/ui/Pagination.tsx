import { useTranslation } from '@/i18n';
import type { ReactNode } from 'react';

import styles from './Pagination.module.css';
import { usePagination } from './usePagination.ts';

type Props = {
  page: number;
  pages: number;
  onPage: (page: number) => void;
};

/** « Précédent · Page 2 sur 5 · Suivant » sous une liste ; rien quand tout tient sur une page. */
export function Pagination({ page, pages, onPage }: Props) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <nav className={styles.pagination} aria-label={t('pagination.titre')}>
      <button
        type="button"
        className={styles.bouton}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {t('pagination.precedent')}
      </button>
      <span className={styles.etat} aria-live="polite">
        {t('pagination.page', { page, pages })}
      </span>
      <button
        type="button"
        className={styles.bouton}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {t('pagination.suivant')}
      </button>
    </nav>
  );
}

type PagineeProps<T> = {
  elements: readonly T[];
  /** Change quand le filtre change : on revient à la première page. */
  cle?: string;
  children: (visibles: readonly T[]) => ReactNode;
};

/** Une liste et sa pagination : `children` reçoit les éléments de la page courante. */
export function Paginee<T>({ elements, cle = '', children }: PagineeProps<T>) {
  const { visibles, page, pages, allerA } = usePagination(elements, cle);
  return (
    <div style={{ minWidth: 0 }}>
      {children(visibles)}
      <Pagination page={page} pages={pages} onPage={allerA} />
    </div>
  );
}
