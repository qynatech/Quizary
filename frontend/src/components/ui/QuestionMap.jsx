import { motion } from 'framer-motion'

/**
 * QuestionMap — navigator grid 1..N dengan status:
 * answered (hijau), reviewed/tandai ragu (kuning), active (ungu/border), unanswered (abu).
 * Sel tipe pilihan menampilkan huruf opsi terpilih (mis. "1.A"); tipe isian
 * hanya nomor. Grid diberi margin dalam (p-1) agar ring/shadow active tidak
 * terpotong tepi scroll container.
 */
export function QuestionMap({ total, current, answered, reviewed, picked, onSelect }) {
  return (
    <div className="grid grid-cols-8 gap-2 p-1">
      {Array.from({ length: total }, (_, i) => {
        const idx = i + 1
        const isActive = current === i
        const letters = picked?.[i] || null

        // 1. Tentukan warna dasar berdasarkan status jawaban terlebih dahulu
        const statusCls = reviewed[i]
          ? 'bg-warn text-white border-warn'
          : answered[i]
            ? 'bg-correct text-white border-correct'
            : 'bg-white dark:bg-ink-900 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-primary/40'

        // 2. Tambahkan style tambahan khusus jika tombol sedang aktif (tanpa menimpa warna dasar)
        const activeCls = isActive
          ? 'border-primary dark:border-primary ring-4 ring-primary/40 shadow-chip z-10 scale-105'
          : ''

        // 3. Label menyusut mengikuti panjang ("1" vs "12.A,C") agar muat di sel
        const labelCls = !letters
          ? 'text-sm'
          : letters.length > 2 ? 'text-[10px] tracking-tight' : 'text-xs'

        return (
          <motion.button
            key={i}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSelect(i)}
            aria-label={letters ? `Go to question ${idx}, answered ${letters}` : `Go to question ${idx}`}
            aria-current={isActive ? 'step' : undefined}
            title={letters ? `Q${idx}: ${letters}` : `Q${idx}`}
            className={`w-full aspect-square rounded-xl font-black border-2 transition-all leading-none whitespace-nowrap ${labelCls} ${statusCls} ${activeCls}`}
          >
            {letters ? `${idx}.${letters}` : idx}
          </motion.button>
        )
      })}
    </div>
  )
}
