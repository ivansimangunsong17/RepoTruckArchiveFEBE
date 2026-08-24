import { Search } from 'lucide-react';

function SearchBar({ query, onChange }) {
  return (
    <label className="flex h-8 items-center rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-slate-400">
      <Search className="mr-2 text-slate-400" size={14} />
      <input
        className="w-full border-0 bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Cari No. SO, sales, customer, tujuan..."
        value={query}
      />
    </label>
  );
}

export default SearchBar;
