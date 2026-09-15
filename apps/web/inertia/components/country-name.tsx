import countryEmojiData from 'countries-list/minimal/countries.emoji.min.json';
import countryNameData from 'countries-list/minimal/countries.en.min.json';

const countryEmoji: Readonly<Record<string, string>> = countryEmojiData;
const countryNames: Readonly<Record<string, string>> = countryNameData;

export function CountryName({ code }: { code: string }) {
	const name = countryNames[code];
	const emoji = countryEmoji[code];

	if (!name || !emoji) {
		return <>{code}</>;
	}

	return (
		<span className="inline-flex min-w-0 items-center gap-2">
			<span aria-hidden="true" className="shrink-0">
				{emoji}
			</span>
			<span className="truncate">{name}</span>
		</span>
	);
}
